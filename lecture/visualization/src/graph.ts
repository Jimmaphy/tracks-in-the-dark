export type SwitchState = 'straight' | 'diverging';
export type Direction = 'forward' | 'reverse';

export interface Position {
    x: number;
    y: number;
}

export interface YardSensor {
    id: string;
    type: 'axle_counter' | 'camera' | 'switch_sensor';
}

export interface YardTrack {
    id: string;
    incoming_axle_counter: string;
    outgoing_axle_counter: string;
    type: 'edge' | 'main' | 'siding';
    camera: string | null;
}

export interface YardConnector {
    id: string;
    incoming_tracks: string[];
    outgoing_tracks: string[];
    sensor: string | null;
    type: 'switch' | 'corner';
}

export interface YardDefinition {
    name: string;
    sensors: YardSensor[];
    tracks: YardTrack[];
    connectors: YardConnector[];
}

export interface TrackRuntimeState {
    axles: number;
    cars: string[];
    activeDirection: Direction | null;
    activeAt: number | null;
    anomaly: string | null;
}

export interface SwitchRuntimeState {
    actual: SwitchState;
    reported: SwitchState;
    anomaly: string | null;
}

export interface YardSnapshot {
    scenarioLabel: string;
    timestampLabel: string;
    selectedTrackId: string | null;
    highlightedRoute: string[];
    activeSensors: string[];
    sensorConfidence: Record<string, number>;
    tracks: Record<string, TrackRuntimeState>;
    switches: Record<string, SwitchRuntimeState>;
}

interface TrackGeometry {
    start: Position;
    end: Position;
    center: Position;
    angle: number;
}

const COLOR = {
    background: '#081118',
    yardFrame: '#0d1f28',
    text: '#eef7fb',
    muted: '#91aebb',
    rail: '#afc4cf',
    active: '#6bd0ff',
    occupied: '#f3a447',
    route: '#7ad38b',
    danger: '#ff7d66',
    connector: '#f2f6f9',
    siding: '#7e98a7',
};

export class YardRenderer {
    private readonly connectorPositions = new Map<string, Position>();
    private readonly trackGeometry = new Map<string, TrackGeometry>();
    private readonly outgoingConnectorByTrack = new Map<string, string>();
    private readonly incomingConnectorByTrack = new Map<string, string>();
    private readonly trackBySensor = new Map<string, string>();

    constructor(
        private readonly yard: YardDefinition,
        points: Array<{ id: string; x: number; y: number }>
    ) {
        for (const point of points) {
            this.connectorPositions.set(point.id, { x: point.x, y: point.y });
        }

        for (const connector of yard.connectors) {
            for (const trackId of connector.outgoing_tracks) {
                this.outgoingConnectorByTrack.set(trackId, connector.id);
            }

            for (const trackId of connector.incoming_tracks) {
                this.incomingConnectorByTrack.set(trackId, connector.id);
            }
        }

        for (const track of yard.tracks) {
            this.trackBySensor.set(track.incoming_axle_counter, track.id);
            this.trackBySensor.set(track.outgoing_axle_counter, track.id);

            if (track.camera) {
                this.trackBySensor.set(track.camera, track.id);
            }

            this.trackGeometry.set(track.id, this.buildTrackGeometry(track.id));
        }
    }

    public resize(canvas: HTMLCanvasElement): void {
        const ratio = window.devicePixelRatio || 1;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;

        canvas.width = Math.max(1, Math.floor(width * ratio));
        canvas.height = Math.max(1, Math.floor(height * ratio));
    }

    public getTrackForSensor(sensorId: string): string | undefined {
        return this.trackBySensor.get(sensorId);
    }

    public render(canvas: HTMLCanvasElement, snapshot: YardSnapshot): void {
        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }

        const scaleX = canvas.width / 560;
        const scaleY = canvas.height / 280;
        context.setTransform(scaleX, 0, 0, scaleY, 0, 0);

        context.clearRect(0, 0, 560, 280);
        this.drawBackground(context);
        this.drawRails(context, snapshot);
        this.drawConnectors(context, snapshot);
        this.drawOverlay(context, snapshot);
    }

    private drawBackground(context: CanvasRenderingContext2D): void {
        const gradient = context.createLinearGradient(0, 0, 560, 280);
        gradient.addColorStop(0, '#071118');
        gradient.addColorStop(1, '#102431');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 560, 280);

        context.fillStyle = 'rgba(255, 255, 255, 0.03)';
        for (let x = 20; x < 560; x += 40) {
            context.fillRect(x, 0, 1, 280);
        }
        for (let y = 20; y < 280; y += 40) {
            context.fillRect(0, y, 560, 1);
        }

        context.strokeStyle = 'rgba(163, 210, 228, 0.15)';
        context.lineWidth = 2;
        context.strokeRect(8, 8, 544, 264);
    }

    private drawRails(context: CanvasRenderingContext2D, snapshot: YardSnapshot): void {
        for (const track of this.yard.tracks) {
            const geometry = this.trackGeometry.get(track.id);
            if (!geometry) {
                continue;
            }

            const runtime = snapshot.tracks[track.id];
            const isHighlighted = snapshot.highlightedRoute.includes(track.id);
            const isSelected = snapshot.selectedTrackId === track.id;
            const isActive = snapshot.activeSensors.some(sensorId => this.trackBySensor.get(sensorId) === track.id);

            let stroke = track.type === 'siding' ? COLOR.siding : COLOR.rail;
            if (runtime.axles > 0 || runtime.cars.length > 0) {
                stroke = COLOR.occupied;
            }
            if (isHighlighted) {
                stroke = COLOR.route;
            }
            if (isActive) {
                stroke = COLOR.active;
            }
            if (runtime.anomaly) {
                stroke = COLOR.danger;
            }

            context.beginPath();
            context.lineCap = 'round';
            context.lineWidth = isSelected ? 8 : 6;
            context.strokeStyle = stroke;
            context.moveTo(geometry.start.x, geometry.start.y);
            context.lineTo(geometry.end.x, geometry.end.y);
            context.stroke();

            context.beginPath();
            context.lineWidth = 2;
            context.strokeStyle = 'rgba(8, 17, 24, 0.9)';
            context.moveTo(geometry.start.x, geometry.start.y);
            context.lineTo(geometry.end.x, geometry.end.y);
            context.stroke();

            context.save();
            context.translate(geometry.center.x, geometry.center.y);
            context.rotate(geometry.angle);
            context.fillStyle = stroke;
            context.beginPath();
            context.moveTo(8, 0);
            context.lineTo(-7, -5);
            context.lineTo(-7, 5);
            context.closePath();
            context.fill();
            context.restore();

            const labelYOffset = track.type === 'siding' ? 16 : -14;
            context.fillStyle = COLOR.text;
            context.font = '11px "Segoe UI"';
            context.fillText(track.id, geometry.center.x - 16, geometry.center.y + labelYOffset);

            if (runtime.cars.length > 0) {
                context.fillStyle = COLOR.muted;
                context.font = '10px "Segoe UI"';
                context.fillText(`${runtime.cars.length} cars`, geometry.center.x - 18, geometry.center.y + labelYOffset + 11);
            }
        }
    }

    private drawConnectors(context: CanvasRenderingContext2D, snapshot: YardSnapshot): void {
        for (const connector of this.yard.connectors) {
            const position = this.connectorPositions.get(connector.id);
            if (!position) {
                continue;
            }

            const runtime = connector.sensor ? snapshot.switches[connector.id] : undefined;
            const hasAnomaly = Boolean(runtime?.anomaly);
            const fill = hasAnomaly ? COLOR.danger : COLOR.connector;

            context.beginPath();
            context.fillStyle = fill;
            context.arc(position.x, position.y, connector.type === 'switch' ? 7 : 5, 0, Math.PI * 2);
            context.fill();

            if (connector.type === 'switch' && runtime) {
                context.fillStyle = COLOR.muted;
                context.font = '10px "Segoe UI"';
                context.fillText(`${connector.id} ${runtime.actual[0].toUpperCase()}`, position.x - 14, position.y - 12);

                if (runtime.reported !== runtime.actual) {
                    context.fillStyle = COLOR.danger;
                    context.fillText(`reported ${runtime.reported[0].toUpperCase()}`, position.x - 20, position.y + 20);
                }
            }
        }
    }

    private drawOverlay(context: CanvasRenderingContext2D, snapshot: YardSnapshot): void {
        context.fillStyle = 'rgba(8, 17, 24, 0.72)';
        context.fillRect(16, 16, 230, 62);
        context.strokeStyle = 'rgba(163, 210, 228, 0.14)';
        context.strokeRect(16, 16, 230, 62);

        context.fillStyle = COLOR.text;
        context.font = 'bold 13px "Segoe UI"';
        context.fillText(snapshot.scenarioLabel, 28, 38);

        context.fillStyle = COLOR.muted;
        context.font = '12px "Segoe UI"';
        context.fillText(snapshot.timestampLabel, 28, 57);
        context.fillText(`Hot sensors: ${snapshot.activeSensors.length}`, 28, 73);
    }

    private buildTrackGeometry(trackId: string): TrackGeometry {
        const outgoingConnectorId = this.outgoingConnectorByTrack.get(trackId);
        const incomingConnectorId = this.incomingConnectorByTrack.get(trackId);

        const start = outgoingConnectorId
            ? this.mustGetPoint(outgoingConnectorId)
            : this.extrapolateEdgePoint(this.mustGetPoint(incomingConnectorId!), 'left');
        const end = incomingConnectorId
            ? this.mustGetPoint(incomingConnectorId)
            : this.extrapolateEdgePoint(this.mustGetPoint(outgoingConnectorId!), 'right');

        return {
            start,
            end,
            center: {
                x: (start.x + end.x) / 2,
                y: (start.y + end.y) / 2,
            },
            angle: Math.atan2(end.y - start.y, end.x - start.x),
        };
    }

    private extrapolateEdgePoint(anchor: Position, side: 'left' | 'right'): Position {
        return {
            x: side === 'left' ? Math.max(28, anchor.x - 90) : Math.min(532, anchor.x + 90),
            y: anchor.y,
        };
    }

    private mustGetPoint(connectorId: string): Position {
        const position = this.connectorPositions.get(connectorId);
        if (!position) {
            throw new Error(`Missing point for connector ${connectorId}`);
        }

        return position;
    }
}
