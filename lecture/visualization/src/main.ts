import {
    Direction,
    SwitchRuntimeState,
    SwitchState,
    TrackRuntimeState,
    YardConnector,
    YardDefinition,
    YardRenderer,
    YardSnapshot,
} from './graph.js';

type FaultKey =
    | 'delay'
    | 'drop'
    | 'duplicate'
    | 'drift'
    | 'outOfOrder'
    | 'switchDisagreement'
    | 'ghostWagon';

interface RawEvent {
    timestamp: string;
    sensor: string;
    data: Record<string, unknown>;
}

interface StateFile {
    tracks: Array<{ id: string; axles: number; cars?: string[] }>;
    switches: Array<{ id: string; state: SwitchState }>;
}

interface ScenarioDefinition {
    id: string;
    label: string;
    path: string | null;
    description: string;
}

interface ScenarioEvent extends RawEvent {
    sequence: number;
    effectiveTimestamp: number;
    originalTimestamp: number;
    faults: string[];
}

interface AppElements {
    canvas: HTMLCanvasElement;
    scenarioSelect: HTMLSelectElement;
    speedSelect: HTMLSelectElement;
    timeline: HTMLInputElement;
    playButton: HTMLButtonElement;
    pauseButton: HTMLButtonElement;
    resetButton: HTMLButtonElement;
    routeButton: HTMLButtonElement;
    moveButton: HTMLButtonElement;
    ghostButton: HTMLButtonElement;
    fromTrack: HTMLSelectElement;
    toTrack: HTMLSelectElement;
    moveCount: HTMLInputElement;
    ghostCarId: HTMLInputElement;
    scenarioPill: HTMLElement;
    clockPill: HTMLElement;
    faultPill: HTMLElement;
    occupiedCount: HTMLElement;
    occupiedDetail: HTMLElement;
    sensorCount: HTMLElement;
    sensorDetail: HTMLElement;
    alertCount: HTMLElement;
    alertDetail: HTMLElement;
    timelineCurrent: HTMLElement;
    timelineTotal: HTMLElement;
    eventLog: HTMLElement;
    trackList: HTMLElement;
    switchList: HTMLElement;
    faultInputs: HTMLInputElement[];
}

interface ManualState {
    tracks: Record<string, TrackRuntimeState>;
    switches: Record<string, SwitchRuntimeState>;
    alerts: string[];
}

const SCENARIOS: ScenarioDefinition[] = [
    { id: 'sandbox', label: 'Sandbox snapshot', path: null, description: 'Manual operations from the advanced yard state.' },
    { id: 'basic', label: 'Basic arrival', path: '../../data/log.basic.json', description: 'Single train entering, dropping wagons, then leaving.' },
    { id: 'medium', label: 'Medium directional replay', path: '../../data/log.medium.json', description: 'Directional axle counts with a return movement.' },
    { id: 'advanced', label: 'Advanced yard choreography', path: '../../data/log.advanced.json', description: 'Multiple yard operations and split movements.' },
    { id: 'advanced-broken', label: 'Advanced broken feed', path: '../../data/log.advanced.broken.json', description: 'Broken telemetry with drift, misses, and contradictions.' },
    { id: 'expert-broken', label: 'Expert broken feed', path: '../../data/log.expert.broken.json', description: 'Broken feed with camera ids and miscounts.' },
];

class YardSimulatorApp {
    private scenarioEventsById = new Map<string, RawEvent[]>();
    private readonly switchIdBySensor = new Map<string, string>();
    private manualState: ManualState;
    private currentScenario = SCENARIOS[0];
    private builtEvents: ScenarioEvent[] = [];
    private highlightedRoute: string[] = [];
    private playbackPosition = 0;
    private playbackDuration = 1;
    private playbackStart = 0;
    private isPlaying = false;
    private speed = 4;
    private lastFrame = 0;
    private readonly activeFaults = new Set<FaultKey>();
    private readonly renderer: YardRenderer;

    constructor(
        private readonly yard: YardDefinition,
        points: Array<{ id: string; x: number; y: number }>,
        private readonly state: StateFile,
        private readonly elements: AppElements
    ) {
        this.manualState = this.createManualState(state);
        this.renderer = new YardRenderer(yard, points);

        for (const connector of yard.connectors) {
            if (connector.sensor) {
                this.switchIdBySensor.set(connector.sensor, connector.id);
            }
        }
    }

    public async loadScenarioData(): Promise<void> {
        const loadTasks: Promise<void>[] = [];
        for (const scenario of SCENARIOS) {
            if (!scenario.path) {
                continue;
            }

            loadTasks.push(
                fetchJson<RawEvent[]>(scenario.path).then(events => {
                    this.scenarioEventsById.set(scenario.id, events);
                })
            );
        }

        await Promise.all(loadTasks);
    }

    public start(): void {
        this.populateScenarioControls();
        this.populateTrackControls();
        this.bindEvents();
        this.rebuildScenario();
        this.renderer.resize(this.elements.canvas);
        this.render();
        requestAnimationFrame(this.tick);
    }

    private tick = (timestamp: number): void => {
        if (this.isPlaying) {
            if (this.lastFrame === 0) {
                this.lastFrame = timestamp;
            }

            const delta = timestamp - this.lastFrame;
            this.playbackPosition = Math.min(this.playbackDuration, this.playbackPosition + delta * this.speed);
            if (this.playbackPosition >= this.playbackDuration) {
                this.isPlaying = false;
            }
            this.syncTimelineInput();
            this.render();
        }

        this.lastFrame = timestamp;
        requestAnimationFrame(this.tick);
    };

    private bindEvents(): void {
        window.addEventListener('resize', () => {
            this.renderer.resize(this.elements.canvas);
            this.render();
        });

        this.elements.scenarioSelect.addEventListener('change', () => {
            const selected = SCENARIOS.find(option => option.id === this.elements.scenarioSelect.value);
            if (selected) {
                this.currentScenario = selected;
                this.rebuildScenario();
                this.render();
            }
        });

        this.elements.speedSelect.addEventListener('change', () => {
            this.speed = Number(this.elements.speedSelect.value) || 1;
        });

        this.elements.playButton.addEventListener('click', () => {
            this.isPlaying = true;
            this.lastFrame = 0;
        });

        this.elements.pauseButton.addEventListener('click', () => {
            this.isPlaying = false;
        });

        this.elements.resetButton.addEventListener('click', () => {
            this.isPlaying = false;
            this.playbackPosition = 0;
            this.highlightedRoute = [];
            this.manualState = this.createManualState(this.state);
            this.rebuildScenario();
            this.render();
        });

        this.elements.timeline.addEventListener('input', () => {
            const percent = Number(this.elements.timeline.value) / 1000;
            this.playbackPosition = this.playbackDuration * percent;
            this.render();
        });

        for (const faultInput of this.elements.faultInputs) {
            faultInput.addEventListener('change', () => {
                const key = faultInput.dataset.fault as FaultKey;
                if (faultInput.checked) {
                    this.activeFaults.add(key);
                } else {
                    this.activeFaults.delete(key);
                }

                this.rebuildScenario();
                this.render();
            });
        }

        this.elements.routeButton.addEventListener('click', () => {
            const path = this.findRoute(this.elements.fromTrack.value, this.elements.toTrack.value);
            if (!path) {
                this.pushAlert('No safe route found for that move with the current switch configuration.');
                this.highlightedRoute = [];
            } else {
                this.highlightedRoute = path;
                this.pushAlert(`Reserved route ${path.join(' -> ')}`);
            }
            this.render();
        });

        this.elements.moveButton.addEventListener('click', () => {
            this.moveCars();
            this.render();
        });

        this.elements.ghostButton.addEventListener('click', () => {
            const targetTrack = this.elements.toTrack.value || 'T4B';
            const ghostId = this.elements.ghostCarId.value.trim() || 'GHOST-01';
            const runtime = this.manualState.tracks[targetTrack];
            runtime.cars.push(ghostId);
            runtime.axles = runtime.cars.length * 4;
            runtime.anomaly = 'Unexpected wagon';
            this.pushAlert(`Ghost wagon ${ghostId} appeared on ${targetTrack}.`);
            this.render();
        });
    }

    private populateScenarioControls(): void {
        this.elements.scenarioSelect.innerHTML = SCENARIOS
            .map(scenario => `<option value="${scenario.id}">${scenario.label}</option>`)
            .join('');
        this.elements.scenarioSelect.value = this.currentScenario.id;
    }

    private populateTrackControls(): void {
        const options = this.yard.tracks
            .map(track => `<option value="${track.id}">${track.id}</option>`)
            .join('');

        this.elements.fromTrack.innerHTML = options;
        this.elements.toTrack.innerHTML = options;
        this.elements.fromTrack.value = 'T2C';
        this.elements.toTrack.value = 'T1E';
        this.renderSwitchboard();
    }

    private rebuildScenario(): void {
        const sourceEvents = this.scenarioEventsById.get(this.currentScenario.id) ?? [];
        this.builtEvents = this.buildScenarioEvents(sourceEvents);

        if (this.builtEvents.length > 0) {
            this.playbackStart = this.builtEvents[0].effectiveTimestamp;
            this.playbackDuration = Math.max(
                1,
                this.builtEvents[this.builtEvents.length - 1].effectiveTimestamp - this.playbackStart
            );
        } else {
            this.playbackStart = Date.now();
            this.playbackDuration = 1;
        }

        this.playbackPosition = 0;
        this.syncTimelineInput();
    }

    private buildScenarioEvents(sourceEvents: RawEvent[]): ScenarioEvent[] {
        const built: ScenarioEvent[] = [];
        let droppedCount = 0;
        let duplicateIndex = 0;

        for (let index = 0; index < sourceEvents.length; index += 1) {
            const event = sourceEvents[index];
            const originalTimestamp = toTimestamp(event.timestamp);
            const faults: string[] = [];
            let effectiveTimestamp = originalTimestamp;
            let dropThisEvent = false;

            if (this.activeFaults.has('delay') && index % 5 === 2) {
                effectiveTimestamp += 120000;
                faults.push('delayed');
            }

            if (this.activeFaults.has('drift')) {
                const driftByFamily = (index % 4 - 1) * 15000;
                effectiveTimestamp += driftByFamily;
                faults.push('clock drift');
            }

            if (this.activeFaults.has('outOfOrder') && index % 6 === 0) {
                effectiveTimestamp -= 45000;
                faults.push('out-of-order');
            }

            if (this.activeFaults.has('drop') && index % 7 === 3) {
                dropThisEvent = true;
                droppedCount += 1;
            }

            if (!dropThisEvent) {
                built.push({
                    ...event,
                    sequence: built.length,
                    originalTimestamp,
                    effectiveTimestamp,
                    faults,
                });
            }

            if (
                this.activeFaults.has('duplicate') &&
                typeof event.data.axle_count === 'number' &&
                index % 6 === 1
            ) {
                duplicateIndex += 1;
                built.push({
                    ...event,
                    sequence: built.length,
                    timestamp: timestampToText(originalTimestamp + 25000),
                    originalTimestamp,
                    effectiveTimestamp: effectiveTimestamp + 25000,
                    faults: ['duplicate'],
                    data: {
                        ...event.data,
                        axle_count: Number(event.data.axle_count) + (duplicateIndex % 2),
                    },
                });
            }
        }

        built.sort((left, right) => left.effectiveTimestamp - right.effectiveTimestamp || left.sequence - right.sequence);

        if (droppedCount > 0) {
            this.pushAlert(`Fault injection dropped ${droppedCount} sensor events from the live feed.`);
        }

        return built;
    }

    private computeSnapshot(): { snapshot: YardSnapshot; alerts: string[]; appliedEvents: ScenarioEvent[] } {
        const snapshotState = cloneManualState(this.manualState);
        const activeSensors = new Set<string>();
        const alerts = [...snapshotState.alerts];
        const appliedEvents: ScenarioEvent[] = [];
        const now = this.playbackStart + this.playbackPosition;
        const recentWindow = 110000;

        if (this.activeFaults.has('ghostWagon')) {
            const ghostTrack = snapshotState.tracks.T4B;
            if (!ghostTrack.cars.includes('GHOST-AUTO')) {
                ghostTrack.cars.unshift('GHOST-AUTO');
                ghostTrack.axles = ghostTrack.cars.length * 4;
                ghostTrack.anomaly = 'Ghost wagon';
            }
        }

        for (const event of this.builtEvents) {
            if (event.effectiveTimestamp > now) {
                break;
            }

            appliedEvents.push(event);
            if (now - event.effectiveTimestamp <= recentWindow) {
                activeSensors.add(event.sensor);
            }

            this.applyEventToState(snapshotState, event, alerts);
        }

        const snapshot: YardSnapshot = {
            scenarioLabel: this.currentScenario.label,
            timestampLabel: this.builtEvents.length > 0 ? formatTimestamp(now) : 'Manual sandbox',
            selectedTrackId: this.elements.fromTrack.value || null,
            highlightedRoute: this.highlightedRoute,
            activeSensors: Array.from(activeSensors.values()),
            sensorConfidence: this.buildSensorConfidence(appliedEvents),
            tracks: snapshotState.tracks,
            switches: snapshotState.switches,
        };

        return { snapshot, alerts, appliedEvents };
    }

    private applyEventToState(state: ManualState, event: ScenarioEvent, alerts: string[]): void {
        const data = event.data;
        const trackId = this.renderer.getTrackForSensor(event.sensor);

        if (typeof data.axle_count === 'number' && trackId) {
            const track = state.tracks[trackId];
            track.activeAt = event.effectiveTimestamp;
            track.activeDirection = parseDirection(data.direction);

            if (event.faults.length > 0) {
                track.anomaly = event.faults.join(', ');
            }
        }

        if (typeof data.new_switch_position === 'string') {
            const switchId = this.switchIdBySensor.get(event.sensor);
            if (switchId) {
                const runtime = state.switches[switchId];
                const reported = data.new_switch_position === 'diverging' ? 'diverging' : 'straight';
                runtime.reported = reported;

                if (this.activeFaults.has('switchDisagreement') && event.sequence % 2 === 0) {
                    runtime.anomaly = 'Reported switch disagrees with actual blade';
                    alerts.push(`Switch ${switchId} reported ${reported} while hardware stayed ${runtime.actual}.`);
                } else {
                    runtime.actual = reported;
                    runtime.anomaly = null;
                }
            }
        }

        if (typeof data.train_id === 'string' && trackId) {
            alerts.push(`Camera ${event.sensor} identified ${String(data.train_id)} on ${trackId}.`);
        }

        if (event.faults.length > 0) {
            alerts.push(`${event.sensor} emitted ${event.faults.join(', ')} data.`);
        }
    }

    private buildSensorConfidence(events: ScenarioEvent[]): Record<string, number> {
        const confidence: Record<string, number> = {};

        for (const sensor of this.yard.sensors) {
            confidence[sensor.id] = 1;
        }

        for (const event of events) {
            if (event.faults.length > 0) {
                confidence[event.sensor] = Math.max(0.2, (confidence[event.sensor] ?? 1) - 0.25);
            }
        }

        return confidence;
    }

    private moveCars(): void {
        const sourceId = this.elements.fromTrack.value;
        const targetId = this.elements.toTrack.value;
        const count = Math.max(1, Number(this.elements.moveCount.value) || 1);
        const source = this.manualState.tracks[sourceId];
        const target = this.manualState.tracks[targetId];
        const route = this.findRoute(sourceId, targetId);

        if (!route) {
            this.pushAlert(`Move blocked: no route from ${sourceId} to ${targetId}.`);
            return;
        }

        if (source.cars.length < count) {
            this.pushAlert(`Move blocked: ${sourceId} only has ${source.cars.length} cars available.`);
            return;
        }

        const occupiedMiddleTrack = route
            .slice(1, -1)
            .find(trackId => this.manualState.tracks[trackId].cars.length > 0);
        if (occupiedMiddleTrack) {
            this.pushAlert(`Move blocked: ${occupiedMiddleTrack} is already occupied, preventing a collision.`);
            return;
        }

        const movedCars = source.cars.splice(source.cars.length - count, count);
        target.cars.push(...movedCars);
        source.axles = source.cars.length * 4;
        target.axles = target.cars.length * 4;
        source.anomaly = null;
        target.anomaly = null;
        this.highlightedRoute = route;
        this.pushAlert(`Moved ${movedCars.join(', ')} from ${sourceId} to ${targetId}.`);
    }

    private findRoute(fromTrackId: string, toTrackId: string): string[] | null {
        if (fromTrackId === toTrackId) {
            return [fromTrackId];
        }

        const queue: string[][] = [[fromTrackId]];
        const visited = new Set<string>([fromTrackId]);

        while (queue.length > 0) {
            const path = queue.shift();
            if (!path) {
                break;
            }

            const current = path[path.length - 1];
            for (const next of this.getAdjacentTracks(current)) {
                if (visited.has(next)) {
                    continue;
                }

                const nextPath = [...path, next];
                if (next === toTrackId) {
                    return nextPath;
                }

                visited.add(next);
                queue.push(nextPath);
            }
        }

        return null;
    }

    private getAdjacentTracks(trackId: string): string[] {
        const adjacent: string[] = [];

        for (const connector of this.yard.connectors) {
            const links = this.getConnectorLinks(connector);
            for (const link of links) {
                if (link[0] === trackId) {
                    adjacent.push(link[1]);
                } else if (link[1] === trackId) {
                    adjacent.push(link[0]);
                }
            }
        }

        return adjacent;
    }

    private getConnectorLinks(connector: YardConnector): Array<[string, string]> {
        if (connector.type === 'corner') {
            return [[connector.incoming_tracks[0], connector.outgoing_tracks[0]]];
        }

        const state = this.manualState.switches[connector.id]?.actual ?? 'straight';
        if (connector.incoming_tracks.length === 1) {
            const trunk = connector.incoming_tracks[0];
            const branch = state === 'straight' ? connector.outgoing_tracks[0] : connector.outgoing_tracks[1];
            return [[trunk, branch]];
        }

        const branch = state === 'straight' ? connector.incoming_tracks[0] : connector.incoming_tracks[1];
        return [[branch, connector.outgoing_tracks[0]]];
    }

    private render(): void {
        const { snapshot, alerts, appliedEvents } = this.computeSnapshot();
        this.renderer.render(this.elements.canvas, snapshot);
        this.renderMetrics(snapshot, alerts);
        this.renderEventLog(appliedEvents);
        this.renderTrackList(snapshot.tracks);
        this.renderSwitchboard();
        this.syncHeader(snapshot);
    }

    private renderMetrics(snapshot: YardSnapshot, alerts: string[]): void {
        const occupiedTracks = this.yard.tracks.filter(track => snapshot.tracks[track.id].cars.length > 0);
        this.elements.occupiedCount.textContent = String(occupiedTracks.length);
        this.elements.occupiedDetail.textContent = occupiedTracks.length > 0
            ? occupiedTracks.map(track => `${track.id} (${snapshot.tracks[track.id].cars.length})`).join(', ')
            : 'No wagons parked';

        this.elements.sensorCount.textContent = String(snapshot.activeSensors.length);
        this.elements.sensorDetail.textContent = snapshot.activeSensors.length > 0
            ? snapshot.activeSensors.join(', ')
            : 'No active telemetry';

        this.elements.alertCount.textContent = String(alerts.length);
        this.elements.alertDetail.textContent = alerts.length > 0
            ? alerts[alerts.length - 1]
            : 'System stable';

        this.elements.timelineCurrent.textContent = formatDuration(this.playbackPosition);
        this.elements.timelineTotal.textContent = formatDuration(this.playbackDuration);
    }

    private renderEventLog(events: ScenarioEvent[]): void {
        const recentEvents = events.slice(Math.max(0, events.length - 12)).reverse();
        if (recentEvents.length === 0) {
            this.elements.eventLog.innerHTML = '<div class="card"><strong>No live events</strong><span>Use the sandbox controls or start a replay.</span></div>';
            return;
        }

        this.elements.eventLog.innerHTML = recentEvents
            .map(event => {
                const details = formatEventDetails(event);
                const faultText = event.faults.length > 0 ? `Faults: ${event.faults.join(', ')}` : 'Nominal reading';
                return `
                    <div class="card">
                        <strong>${event.sensor}</strong>
                        <span>${formatTimestamp(event.effectiveTimestamp)}</span>
                        <small>${details}</small>
                        <small>${faultText}</small>
                    </div>
                `;
            })
            .join('');
    }

    private renderTrackList(tracks: Record<string, TrackRuntimeState>): void {
        const orderedTracks = [...this.yard.tracks].sort((left, right) => {
            return tracks[right.id].cars.length - tracks[left.id].cars.length || left.id.localeCompare(right.id);
        });

        this.elements.trackList.innerHTML = orderedTracks
            .map(track => {
                const runtime = tracks[track.id];
                const cars = runtime.cars.length > 0 ? runtime.cars.join(', ') : 'empty';
                const anomaly = runtime.anomaly ? ` | ${runtime.anomaly}` : '';
                return `
                    <div class="card">
                        <strong>${track.id}</strong>
                        <span>${track.type} | ${runtime.axles} axles${anomaly}</span>
                        <small>${cars}</small>
                    </div>
                `;
            })
            .join('');
    }

    private renderSwitchboard(): void {
        const switches = this.yard.connectors.filter(connector => connector.type === 'switch');
        this.elements.switchList.innerHTML = switches
            .map(connector => {
                const runtime = this.manualState.switches[connector.id];
                const nextState = runtime.actual === 'straight' ? 'diverging' : 'straight';
                return `
                    <div class="switch-chip">
                        <span>${connector.id}: ${runtime.actual}</span>
                        <button type="button" data-switch="${connector.id}" data-next="${nextState}">${nextState}</button>
                    </div>
                `;
            })
            .join('');

        const buttons = this.elements.switchList.querySelectorAll<HTMLButtonElement>('button[data-switch]');
        for (const button of Array.from(buttons)) {
            button.addEventListener('click', () => {
                const switchId = button.dataset.switch;
                const next = button.dataset.next as SwitchState | undefined;
                if (!switchId || !next) {
                    return;
                }

                const runtime = this.manualState.switches[switchId];
                runtime.actual = next;
                runtime.reported = next;
                runtime.anomaly = null;
                this.pushAlert(`Operator set ${switchId} to ${next}.`);
                this.render();
            });
        }
    }

    private syncHeader(snapshot: YardSnapshot): void {
        this.elements.scenarioPill.textContent = `Scenario: ${this.currentScenario.label}`;
        this.elements.clockPill.textContent = `Clock: ${snapshot.timestampLabel}`;
        this.elements.faultPill.textContent = this.activeFaults.size > 0
            ? `Faults: ${Array.from(this.activeFaults.values()).join(', ')}`
            : 'Faults: none';
    }

    private syncTimelineInput(): void {
        const percent = Math.round((this.playbackPosition / this.playbackDuration) * 1000);
        this.elements.timeline.value = String(Math.max(0, Math.min(1000, percent)));
    }

    private pushAlert(message: string): void {
        this.manualState.alerts.push(message);
        if (this.manualState.alerts.length > 18) {
            this.manualState.alerts.shift();
        }
    }

    private createManualState(state: StateFile): ManualState {
        const tracks: Record<string, TrackRuntimeState> = {};
        const switches: Record<string, SwitchRuntimeState> = {};

        for (const track of this.yard.tracks) {
            tracks[track.id] = {
                axles: 0,
                cars: [],
                activeDirection: null,
                activeAt: null,
                anomaly: null,
            };
        }

        for (const track of state.tracks) {
            tracks[track.id] = {
                ...tracks[track.id],
                axles: track.axles,
                cars: [...(track.cars ?? [])],
            };
        }

        for (const connector of this.yard.connectors) {
            if (connector.type !== 'switch') {
                continue;
            }

            switches[connector.id] = {
                actual: 'straight',
                reported: 'straight',
                anomaly: null,
            };
        }

        for (const switchState of state.switches) {
            if (switches[switchState.id]) {
                switches[switchState.id] = {
                    actual: switchState.state,
                    reported: switchState.state,
                    anomaly: null,
                };
            }
        }

        return {
            tracks,
            switches,
            alerts: ['Sandbox restored from advanced yard state.'],
        };
    }
}

async function bootstrap(): Promise<void> {
    const elements = getElements();
    const [yard, points, state] = await Promise.all([
        fetchJson<YardDefinition>('../../data/yard.json'),
        fetchJson<Array<{ id: string; x: number; y: number }>>('../../data/points.json'),
        fetchJson<StateFile>('../../data/state.advanced.json'),
    ]);

    const app = new YardSimulatorApp(yard, points, state, elements);
    await app.loadScenarioData();
    app.start();
}

function getElements(): AppElements {
    return {
        canvas: requireElement<HTMLCanvasElement>('graph'),
        scenarioSelect: requireElement<HTMLSelectElement>('scenario-select'),
        speedSelect: requireElement<HTMLSelectElement>('speed-select'),
        timeline: requireElement<HTMLInputElement>('timeline'),
        playButton: requireElement<HTMLButtonElement>('play-button'),
        pauseButton: requireElement<HTMLButtonElement>('pause-button'),
        resetButton: requireElement<HTMLButtonElement>('reset-button'),
        routeButton: requireElement<HTMLButtonElement>('route-button'),
        moveButton: requireElement<HTMLButtonElement>('move-button'),
        ghostButton: requireElement<HTMLButtonElement>('ghost-button'),
        fromTrack: requireElement<HTMLSelectElement>('from-track'),
        toTrack: requireElement<HTMLSelectElement>('to-track'),
        moveCount: requireElement<HTMLInputElement>('move-count'),
        ghostCarId: requireElement<HTMLInputElement>('ghost-car-id'),
        scenarioPill: requireElement<HTMLElement>('scenario-pill'),
        clockPill: requireElement<HTMLElement>('clock-pill'),
        faultPill: requireElement<HTMLElement>('fault-pill'),
        occupiedCount: requireElement<HTMLElement>('occupied-count'),
        occupiedDetail: requireElement<HTMLElement>('occupied-detail'),
        sensorCount: requireElement<HTMLElement>('sensor-count'),
        sensorDetail: requireElement<HTMLElement>('sensor-detail'),
        alertCount: requireElement<HTMLElement>('alert-count'),
        alertDetail: requireElement<HTMLElement>('alert-detail'),
        timelineCurrent: requireElement<HTMLElement>('timeline-current'),
        timelineTotal: requireElement<HTMLElement>('timeline-total'),
        eventLog: requireElement<HTMLElement>('event-log'),
        trackList: requireElement<HTMLElement>('track-list'),
        switchList: requireElement<HTMLElement>('switch-list'),
        faultInputs: Array.from(document.querySelectorAll<HTMLInputElement>('input[data-fault]')),
    };
}

function requireElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element #${id}`);
    }

    return element as T;
}

async function fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load ${path}`);
    }

    return response.json() as Promise<T>;
}

function cloneManualState(state: ManualState): ManualState {
    const tracks: Record<string, TrackRuntimeState> = {};
    const switches: Record<string, SwitchRuntimeState> = {};

    for (const trackId of Object.keys(state.tracks)) {
        const track = state.tracks[trackId];
        tracks[trackId] = {
            axles: track.axles,
            cars: [...track.cars],
            activeDirection: track.activeDirection,
            activeAt: track.activeAt,
            anomaly: track.anomaly,
        };
    }

    for (const switchId of Object.keys(state.switches)) {
        const runtime = state.switches[switchId];
        switches[switchId] = {
            actual: runtime.actual,
            reported: runtime.reported,
            anomaly: runtime.anomaly,
        };
    }

    return {
        tracks,
        switches,
        alerts: [...state.alerts],
    };
}

function toTimestamp(text: string): number {
    return new Date(text.replace(' ', 'T')).getTime();
}

function timestampToText(value: number): string {
    const iso = new Date(value).toISOString();
    return iso.slice(0, 19).replace('T', ' ');
}

function formatTimestamp(value: number): string {
    return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: 'short',
    }).format(new Date(value));
}

function formatDuration(value: number): string {
    const totalSeconds = Math.floor(value / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseDirection(value: unknown): Direction | null {
    return value === 'forward' || value === 'reverse' ? value : null;
}

function formatEventDetails(event: ScenarioEvent): string {
    if (typeof event.data.axle_count === 'number') {
        const direction = typeof event.data.direction === 'string' ? ` ${event.data.direction}` : '';
        return `${event.data.axle_count} axles${direction}`;
    }

    if (typeof event.data.new_switch_position === 'string') {
        return `switch ${event.data.new_switch_position}`;
    }

    if (typeof event.data.train_id === 'string') {
        return `train ${event.data.train_id}`;
    }

    return 'sensor update';
}

bootstrap().catch(error => {
    console.error(error);
    document.body.innerHTML = `<pre style="padding: 24px; color: white; background: #081118;">${String(error)}</pre>`;
});
