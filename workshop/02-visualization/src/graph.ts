export type NodeId = string;

export interface Position {
    x: number;
    y: number;
}

export interface Node {
    id: NodeId;
    position: Position;
}

export interface Edge {
    from: NodeId;
    to: NodeId;
}

export class Graph {
    private nodes = new Map<NodeId, Node>();
    private connections = new Map<NodeId, Edge[]>();

    addNode(id: NodeId, position: Position): void {
        this.nodes.set(id, { id, position });
        this.connections.set(id, []);
    }

    addEdge(from: NodeId, to: NodeId): void {
        this.connections.get(from)?.push({ from, to });
    }

    getConnections(id: NodeId): Edge[] {
        return this.connections.get(id) ?? [];
    }

    render(canvas: HTMLCanvasElement): void {
        const context = canvas.getContext('2d')!;

        // Drawing the background
        context.fillStyle = 'black';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the edges
        context.strokeStyle = 'white';
        context.fillStyle = 'white';
        context.lineWidth = 2;
        
        for (const edges of this.connections.values()) {
            for (const edge of edges) {
                // Draw line between nodes
                const fromNode = this.nodes.get(edge.from)!;
                const toNode = this.nodes.get(edge.to)!;

                context.beginPath();
                context.moveTo(fromNode.position.x, fromNode.position.y);
                context.lineTo(toNode.position.x, toNode.position.y);
                context.stroke();

                // Draw arrowhead in the middle of the edge
                const middleX = (fromNode.position.x + toNode.position.x) / 2;
                const middleY = (fromNode.position.y + toNode.position.y) / 2;
                const differenceX = toNode.position.x - fromNode.position.x;
                const differenceY = toNode.position.y - fromNode.position.y;
                const angle = Math.atan2(differenceY, differenceX);

                context.save();
                context.translate(middleX, middleY);
                context.rotate(angle);
                context.beginPath();
                context.moveTo(5, 0);
                context.lineTo(-5, -5);
                context.lineTo(-5, 5);
                context.closePath();
                context.fill();
                context.stroke();
                context.restore();
            }
        }

        // Draw the nodes
        context.fillStyle = 'orange';

        for (const node of this.nodes.values()) {
            context.beginPath();
            context.arc(node.position.x, node.position.y, 10, 0, Math.PI * 2);
            context.fill();
        }
    }
}