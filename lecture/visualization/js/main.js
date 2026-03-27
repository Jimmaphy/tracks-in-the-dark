import { YardRenderer } from './graph.js';

const SCENARIOS = [
    { id: 'sandbox', label: 'Sandbox snapshot', path: null },
    { id: 'basic', label: 'Basic arrival', path: '../../data/log.basic.json' },
    { id: 'medium', label: 'Medium directional replay', path: '../../data/log.medium.json' },
    { id: 'advanced', label: 'Advanced yard choreography', path: '../../data/log.advanced.json' },
    { id: 'advanced-broken', label: 'Advanced broken feed', path: '../../data/log.advanced.broken.json' },
    { id: 'expert-broken', label: 'Expert broken feed', path: '../../data/log.expert.broken.json' },
];

class YardSimulatorApp {
    constructor(yard, points, state, elements) {
        this.yard = yard;
        this.state = state;
        this.elements = elements;
        this.scenarioEventsById = new Map();
        this.switchIdBySensor = new Map();
        this.currentScenario = SCENARIOS[0];
        this.builtEvents = [];
        this.highlightedRoute = [];
        this.playbackPosition = 0;
        this.playbackDuration = 1;
        this.playbackStart = 0;
        this.isPlaying = false;
        this.speed = 4;
        this.lastFrame = 0;
        this.activeFaults = new Set();
        this.manualState = this.createManualState(state);
        this.renderer = new YardRenderer(yard, points);

        for (const connector of yard.connectors) {
            if (connector.sensor) {
                this.switchIdBySensor.set(connector.sensor, connector.id);
            }
        }

        this.tick = timestamp => {
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
    }

    async loadScenarioData() {
        const loadTasks = [];
        for (const scenario of SCENARIOS) {
            if (!scenario.path) {
                continue;
            }

            loadTasks.push(
                fetchJson(scenario.path).then(events => {
                    this.scenarioEventsById.set(scenario.id, events);
                })
            );
        }

        await Promise.all(loadTasks);
    }

    start() {
        this.populateScenarioControls();
        this.populateTrackControls();
        this.bindEvents();
        this.rebuildScenario();
        this.renderer.resize(this.elements.canvas);
        this.render();
        requestAnimationFrame(this.tick);
    }

    bindEvents() {
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
                const key = faultInput.dataset.fault;
                if (!key) {
                    return;
                }
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
            const path = this.findRoute(this.elements.fromTrack.value, this.elements.toTrack.value, true);
            if (!path) {
                this.pushAlert('No safe route found for that move with the current switch configuration.');
                this.highlightedRoute = [];
            } else {
                this.alignSwitchesForRoute(path);
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

    populateScenarioControls() {
        this.elements.scenarioSelect.innerHTML = SCENARIOS
            .map(scenario => `<option value="${scenario.id}">${scenario.label}</option>`)
            .join('');
        this.elements.scenarioSelect.value = this.currentScenario.id;
    }

    populateTrackControls() {
        const options = this.yard.tracks
            .map(track => `<option value="${track.id}">${track.id}</option>`)
            .join('');

        this.elements.fromTrack.innerHTML = options;
        this.elements.toTrack.innerHTML = options;
        this.elements.fromTrack.value = 'T2C';
        this.elements.toTrack.value = 'T1E';
        this.renderSwitchboard();
    }

    rebuildScenario() {
        const sourceEvents = this.scenarioEventsById.get(this.currentScenario.id) ?? [];
        this.builtEvents = this.buildScenarioEvents(sourceEvents);

        if (this.builtEvents.length > 0) {
            this.playbackStart = this.builtEvents[0].effectiveTimestamp;
            this.playbackDuration = Math.max(1, this.builtEvents[this.builtEvents.length - 1].effectiveTimestamp - this.playbackStart);
        } else {
            this.playbackStart = Date.now();
            this.playbackDuration = 1;
        }

        this.playbackPosition = 0;
        this.syncTimelineInput();
    }

    buildScenarioEvents(sourceEvents) {
        const built = [];
        let droppedCount = 0;
        let duplicateIndex = 0;

        for (let index = 0; index < sourceEvents.length; index += 1) {
            const event = sourceEvents[index];
            const originalTimestamp = toTimestamp(event.timestamp);
            const faults = [];
            let effectiveTimestamp = originalTimestamp;
            let dropThisEvent = false;

            if (this.activeFaults.has('delay') && index % 5 === 2) {
                effectiveTimestamp += 120000;
                faults.push('delayed');
            }

            if (this.activeFaults.has('drift')) {
                effectiveTimestamp += (index % 4 - 1) * 15000;
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

            if (this.activeFaults.has('duplicate') && typeof event.data.axle_count === 'number' && index % 6 === 1) {
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

    computeSnapshot() {
        const snapshotState = cloneManualState(this.manualState);
        const activeSensors = new Set();
        const alerts = [...snapshotState.alerts];
        const appliedEvents = [];
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

        return {
            snapshot: {
                scenarioLabel: this.currentScenario.label,
                timestampLabel: this.builtEvents.length > 0 ? formatTimestamp(now) : 'Manual sandbox',
                currentTimeMs: now,
                selectedTrackId: this.elements.fromTrack.value || null,
                highlightedRoute: this.highlightedRoute,
                activeSensors: Array.from(activeSensors.values()),
                sensorConfidence: this.buildSensorConfidence(appliedEvents),
                tracks: snapshotState.tracks,
                switches: snapshotState.switches,
            },
            alerts,
            appliedEvents,
        };
    }

    applyEventToState(state, event, alerts) {
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

    buildSensorConfidence(events) {
        const confidence = {};
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

    moveCars() {
        const sourceId = this.elements.fromTrack.value;
        const targetId = this.elements.toTrack.value;
        const count = Math.max(1, Number(this.elements.moveCount.value) || 1);
        const source = this.manualState.tracks[sourceId];
        const target = this.manualState.tracks[targetId];
        const route = this.findRoute(sourceId, targetId, true);

        if (!route) {
            this.pushAlert(`Move blocked: no route from ${sourceId} to ${targetId}.`);
            return;
        }

        if (source.cars.length < count) {
            this.pushAlert(`Move blocked: ${sourceId} only has ${source.cars.length} cars available.`);
            return;
        }

        const occupiedMiddleTrack = route.slice(1, -1).find(trackId => this.manualState.tracks[trackId].cars.length > 0);
        if (occupiedMiddleTrack) {
            this.pushAlert(`Move blocked: ${occupiedMiddleTrack} is already occupied, preventing a collision.`);
            return;
        }

        const movedCars = source.cars.splice(source.cars.length - count, count);
        this.alignSwitchesForRoute(route);
        target.cars.push(...movedCars);
        source.axles = source.cars.length * 4;
        target.axles = target.cars.length * 4;
        source.activeAt = Date.now();
        target.activeAt = Date.now();
        source.activeDirection = 'forward';
        target.activeDirection = 'forward';
        source.anomaly = null;
        target.anomaly = null;
        this.highlightedRoute = route;
        this.pushAlert(`Moved ${movedCars.join(', ')} from ${sourceId} to ${targetId}.`);
    }

    findRoute(fromTrackId, toTrackId, useAllSwitchBranches = false) {
        if (fromTrackId === toTrackId) {
            return [fromTrackId];
        }

        const queue = [[fromTrackId]];
        const visited = new Set([fromTrackId]);

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];
            for (const next of this.getAdjacentTracks(current, useAllSwitchBranches)) {
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

    getAdjacentTracks(trackId, useAllSwitchBranches) {
        const adjacent = [];
        for (const connector of this.yard.connectors) {
            const links = this.getConnectorLinks(connector, useAllSwitchBranches);
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

    getConnectorLinks(connector, useAllSwitchBranches = false) {
        if (connector.type === 'corner') {
            return [[connector.incoming_tracks[0], connector.outgoing_tracks[0]]];
        }

        if (useAllSwitchBranches) {
            if (connector.incoming_tracks.length === 1) {
                return connector.outgoing_tracks.map(trackId => [connector.incoming_tracks[0], trackId]);
            }
            return connector.incoming_tracks.map(trackId => [trackId, connector.outgoing_tracks[0]]);
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

    alignSwitchesForRoute(route) {
        for (let index = 0; index < route.length - 1; index += 1) {
            const fromTrack = route[index];
            const toTrack = route[index + 1];

            for (const connector of this.yard.connectors) {
                if (connector.type !== 'switch') {
                    continue;
                }

                if (connector.incoming_tracks.length === 1 && connector.incoming_tracks[0] === fromTrack) {
                    const desiredState = connector.outgoing_tracks[0] === toTrack ? 'straight' : 'diverging';
                    this.manualState.switches[connector.id].actual = desiredState;
                    this.manualState.switches[connector.id].reported = desiredState;
                }

                if (connector.outgoing_tracks[0] === toTrack && connector.incoming_tracks.includes(fromTrack)) {
                    const desiredState = connector.incoming_tracks[0] === fromTrack ? 'straight' : 'diverging';
                    this.manualState.switches[connector.id].actual = desiredState;
                    this.manualState.switches[connector.id].reported = desiredState;
                }
            }
        }
    }

    render() {
        const { snapshot, alerts, appliedEvents } = this.computeSnapshot();
        this.renderer.render(this.elements.canvas, snapshot);
        this.renderMetrics(snapshot, alerts);
        this.renderEventLog(appliedEvents);
        this.renderTrackList(snapshot.tracks);
        this.renderSwitchboard();
        this.syncHeader(snapshot);
    }

    renderMetrics(snapshot, alerts) {
        const occupiedTracks = this.yard.tracks.filter(track => snapshot.tracks[track.id].cars.length > 0);
        this.elements.occupiedCount.textContent = String(occupiedTracks.length);
        this.elements.occupiedDetail.textContent = occupiedTracks.length > 0
            ? occupiedTracks.map(track => `${track.id} (${snapshot.tracks[track.id].cars.length})`).join(', ')
            : 'No wagons parked';

        this.elements.sensorCount.textContent = String(snapshot.activeSensors.length);
        this.elements.sensorDetail.textContent = snapshot.activeSensors.length > 0 ? snapshot.activeSensors.join(', ') : 'No active telemetry';
        this.elements.alertCount.textContent = String(alerts.length);
        this.elements.alertDetail.textContent = alerts.length > 0 ? alerts[alerts.length - 1] : 'System stable';
        this.elements.timelineCurrent.textContent = formatDuration(this.playbackPosition);
        this.elements.timelineTotal.textContent = formatDuration(this.playbackDuration);
    }

    renderEventLog(events) {
        const recentEvents = events.slice(Math.max(0, events.length - 12)).reverse();
        if (recentEvents.length === 0) {
            this.elements.eventLog.innerHTML = '<div class="card"><strong>No live events</strong><span>Use the sandbox controls or start a replay.</span></div>';
            return;
        }

        this.elements.eventLog.innerHTML = recentEvents.map(event => `
            <div class="card">
                <strong>${event.sensor}</strong>
                <span>${formatTimestamp(event.effectiveTimestamp)}</span>
                <small>${formatEventDetails(event)}</small>
                <small>${event.faults.length > 0 ? `Faults: ${event.faults.join(', ')}` : 'Nominal reading'}</small>
            </div>
        `).join('');
    }

    renderTrackList(tracks) {
        const orderedTracks = [...this.yard.tracks].sort((left, right) => {
            return tracks[right.id].cars.length - tracks[left.id].cars.length || left.id.localeCompare(right.id);
        });

        this.elements.trackList.innerHTML = orderedTracks.map(track => {
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
        }).join('');
    }

    renderSwitchboard() {
        const switches = this.yard.connectors.filter(connector => connector.type === 'switch');
        this.elements.switchList.innerHTML = switches.map(connector => {
            const runtime = this.manualState.switches[connector.id];
            const nextState = runtime.actual === 'straight' ? 'diverging' : 'straight';
            return `
                <div class="switch-chip">
                    <span>${connector.id}: ${runtime.actual}</span>
                    <button type="button" data-switch="${connector.id}" data-next="${nextState}">${nextState}</button>
                </div>
            `;
        }).join('');

        const buttons = this.elements.switchList.querySelectorAll('button[data-switch]');
        for (const button of Array.from(buttons)) {
            button.addEventListener('click', () => {
                const switchId = button.dataset.switch;
                const next = button.dataset.next;
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

    syncHeader(snapshot) {
        this.elements.scenarioPill.textContent = `Scenario: ${this.currentScenario.label}`;
        this.elements.clockPill.textContent = `Clock: ${snapshot.timestampLabel}`;
        this.elements.faultPill.textContent = this.activeFaults.size > 0
            ? `Faults: ${Array.from(this.activeFaults.values()).join(', ')}`
            : 'Faults: none';
    }

    syncTimelineInput() {
        const percent = Math.round((this.playbackPosition / this.playbackDuration) * 1000);
        this.elements.timeline.value = String(Math.max(0, Math.min(1000, percent)));
    }

    pushAlert(message) {
        this.manualState.alerts.push(message);
        if (this.manualState.alerts.length > 18) {
            this.manualState.alerts.shift();
        }
    }

    createManualState(state) {
        const tracks = {};
        const switches = {};

        for (const track of this.yard.tracks) {
            tracks[track.id] = { axles: 0, cars: [], activeDirection: null, activeAt: null, anomaly: null };
        }

        for (const track of state.tracks) {
            tracks[track.id] = { ...tracks[track.id], axles: track.axles, cars: [...(track.cars ?? [])] };
        }

        for (const connector of this.yard.connectors) {
            if (connector.type === 'switch') {
                switches[connector.id] = { actual: 'straight', reported: 'straight', anomaly: null };
            }
        }

        for (const switchState of state.switches) {
            if (switches[switchState.id]) {
                switches[switchState.id] = { actual: switchState.state, reported: switchState.state, anomaly: null };
            }
        }

        return { tracks, switches, alerts: ['Sandbox restored from advanced yard state.'] };
    }
}

async function bootstrap() {
    const elements = getElements();
    const [yard, points, state] = await Promise.all([
        fetchJson('../../data/yard.json'),
        fetchJson('../../data/points.json'),
        fetchJson('../../data/state.advanced.json'),
    ]);

    const app = new YardSimulatorApp(yard, points, state, elements);
    await app.loadScenarioData();
    app.start();
}

function getElements() {
    return {
        canvas: requireElement('graph'),
        scenarioSelect: requireElement('scenario-select'),
        speedSelect: requireElement('speed-select'),
        timeline: requireElement('timeline'),
        playButton: requireElement('play-button'),
        pauseButton: requireElement('pause-button'),
        resetButton: requireElement('reset-button'),
        routeButton: requireElement('route-button'),
        moveButton: requireElement('move-button'),
        ghostButton: requireElement('ghost-button'),
        fromTrack: requireElement('from-track'),
        toTrack: requireElement('to-track'),
        moveCount: requireElement('move-count'),
        ghostCarId: requireElement('ghost-car-id'),
        scenarioPill: requireElement('scenario-pill'),
        clockPill: requireElement('clock-pill'),
        faultPill: requireElement('fault-pill'),
        occupiedCount: requireElement('occupied-count'),
        occupiedDetail: requireElement('occupied-detail'),
        sensorCount: requireElement('sensor-count'),
        sensorDetail: requireElement('sensor-detail'),
        alertCount: requireElement('alert-count'),
        alertDetail: requireElement('alert-detail'),
        timelineCurrent: requireElement('timeline-current'),
        timelineTotal: requireElement('timeline-total'),
        eventLog: requireElement('event-log'),
        trackList: requireElement('track-list'),
        switchList: requireElement('switch-list'),
        faultInputs: Array.from(document.querySelectorAll('input[data-fault]')),
    };
}

function requireElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Missing element #${id}`);
    }
    return element;
}

async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load ${path}`);
    }
    return response.json();
}

function cloneManualState(state) {
    const tracks = {};
    const switches = {};

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
        switches[switchId] = { actual: runtime.actual, reported: runtime.reported, anomaly: runtime.anomaly };
    }

    return { tracks, switches, alerts: [...state.alerts] };
}

function toTimestamp(text) {
    return new Date(text.replace(' ', 'T')).getTime();
}

function timestampToText(value) {
    return new Date(value).toISOString().slice(0, 19).replace('T', ' ');
}

function formatTimestamp(value) {
    return new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: 'short',
    }).format(new Date(value));
}

function formatDuration(value) {
    const totalSeconds = Math.floor(value / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseDirection(value) {
    return value === 'forward' || value === 'reverse' ? value : null;
}

function formatEventDetails(event) {
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
