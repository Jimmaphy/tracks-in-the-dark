const COLOR = {
    text: '#eef7fb',
    muted: '#91aebb',
    rail: '#afc4cf',
    active: '#6bd0ff',
    occupied: '#f3a447',
    route: '#36f2a4',
    routeGlow: 'rgba(54, 242, 164, 0.28)',
    danger: '#ff7d66',
    connector: '#f2f6f9',
    siding: '#7e98a7',
};

export class YardRenderer {
    constructor(yard, points) {
        this.yard = yard;
        this.connectorPositions = new Map();
        this.trackGeometry = new Map();
        this.outgoingConnectorByTrack = new Map();
        this.incomingConnectorByTrack = new Map();
        this.trackBySensor = new Map();

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

    resize(canvas) {
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
        canvas.height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    }

    getTrackForSensor(sensorId) {
        return this.trackBySensor.get(sensorId);
    }

    render(canvas, snapshot) {
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

    drawBackground(context) {
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

    drawRails(context, snapshot) {
        for (const track of this.yard.tracks) {
            const geometry = this.trackGeometry.get(track.id);
            const runtime = snapshot.tracks[track.id];
            if (!geometry || !runtime) {
                continue;
            }

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

            if (isHighlighted) {
                context.beginPath();
                context.lineCap = 'round';
                context.lineWidth = 14;
                context.strokeStyle = COLOR.routeGlow;
                context.moveTo(geometry.start.x, geometry.start.y);
                context.lineTo(geometry.end.x, geometry.end.y);
                context.stroke();
            }

            context.beginPath();
            context.lineCap = 'round';
            context.lineWidth = isHighlighted ? 10 : isSelected ? 8 : 6;
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

            this.drawDirectionMarker(context, geometry, runtime, stroke);

            const labelYOffset = track.type === 'siding' ? 16 : -14;
            context.fillStyle = COLOR.text;
            context.font = '11px "Segoe UI"';
            context.fillText(track.id, geometry.center.x - 16, geometry.center.y + labelYOffset);

            if (runtime.cars.length > 0) {
                this.drawCarsOnTrack(context, geometry, runtime, snapshot.currentTimeMs);
                context.fillStyle = COLOR.muted;
                context.font = '10px "Segoe UI"';
                context.fillText(`${runtime.cars.length} cars`, geometry.center.x - 18, geometry.center.y + labelYOffset + 11);
            }
        }
    }

    drawConnectors(context, snapshot) {
        for (const connector of this.yard.connectors) {
            const position = this.connectorPositions.get(connector.id);
            if (!position) {
                continue;
            }

            const runtime = connector.sensor ? snapshot.switches[connector.id] : undefined;
            const fill = runtime && runtime.anomaly ? COLOR.danger : COLOR.connector;

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

    drawOverlay(context, snapshot) {
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

    drawDirectionMarker(context, geometry, runtime, stroke) {
        context.save();
        context.translate(geometry.center.x, geometry.center.y);

        if (runtime.activeDirection === 'reverse') {
            context.rotate(geometry.angle + Math.PI);
        } else if (runtime.activeDirection === 'forward') {
            context.rotate(geometry.angle);
        } else {
            context.rotate(geometry.angle);
            context.strokeStyle = COLOR.muted;
            context.lineWidth = 2;
            context.beginPath();
            context.moveTo(-7, -4);
            context.lineTo(0, 0);
            context.lineTo(-7, 4);
            context.moveTo(7, -4);
            context.lineTo(0, 0);
            context.lineTo(7, 4);
            context.stroke();
            context.restore();
            return;
        }

        context.fillStyle = stroke;
        context.beginPath();
        context.moveTo(8, 0);
        context.lineTo(-7, -5);
        context.lineTo(-7, 5);
        context.closePath();
        context.fill();
        context.restore();
    }

    drawCarsOnTrack(context, geometry, runtime, currentTimeMs) {
        const visibleCars = runtime.cars.slice(0, 5);
        const spacing = 18;
        const startOffset = -((visibleCars.length - 1) * spacing) / 2;
        const angle = runtime.activeDirection === 'reverse' ? geometry.angle + Math.PI : geometry.angle;
        const motionAge = runtime.activeAt === null ? Number.POSITIVE_INFINITY : currentTimeMs - runtime.activeAt;
        const motionRatio = motionAge >= 0 && motionAge < 5000 ? 1 - motionAge / 5000 : 0;
        const directionMultiplier = runtime.activeDirection === 'reverse' ? -1 : 1;
        const motionShift = motionRatio * 24 * directionMultiplier;

        for (let index = 0; index < visibleCars.length; index += 1) {
            const offset = startOffset + index * spacing + motionShift;
            const x = geometry.center.x + Math.cos(geometry.angle) * offset;
            const y = geometry.center.y + Math.sin(geometry.angle) * offset;

            context.save();
            context.translate(x, y);
            context.rotate(angle);
            context.fillStyle = runtime.anomaly ? COLOR.danger : '#f6efe2';
            context.strokeStyle = '#09141b';
            context.lineWidth = 1.5;
            context.beginPath();
            context.roundRect(-8, -5, 16, 10, 3);
            context.fill();
            context.stroke();
            context.fillStyle = '#0d1f28';
            context.fillRect(-2, -4, 4, 8);
            context.restore();
        }

        if (runtime.cars.length > visibleCars.length) {
            context.fillStyle = COLOR.text;
            context.font = 'bold 10px "Segoe UI"';
            context.fillText(`+${runtime.cars.length - visibleCars.length}`, geometry.center.x + 18, geometry.center.y - 10);
        }
    }

    buildTrackGeometry(trackId) {
        const outgoingConnectorId = this.outgoingConnectorByTrack.get(trackId);
        const incomingConnectorId = this.incomingConnectorByTrack.get(trackId);

        const start = outgoingConnectorId
            ? this.mustGetPoint(outgoingConnectorId)
            : this.extrapolateEdgePoint(this.mustGetPoint(incomingConnectorId), 'left');
        const end = incomingConnectorId
            ? this.mustGetPoint(incomingConnectorId)
            : this.extrapolateEdgePoint(this.mustGetPoint(outgoingConnectorId), 'right');

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

    extrapolateEdgePoint(anchor, side) {
        return {
            x: side === 'left' ? Math.max(28, anchor.x - 90) : Math.min(532, anchor.x + 90),
            y: anchor.y,
        };
    }

    mustGetPoint(connectorId) {
        const position = this.connectorPositions.get(connectorId);
        if (!position) {
            throw new Error(`Missing point for connector ${connectorId}`);
        }
        return position;
    }
}
