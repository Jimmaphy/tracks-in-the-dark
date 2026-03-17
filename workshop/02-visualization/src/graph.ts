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
        context.lineWidth = 2;
        
        for (const edges of this.connections.values()) {
            for (const edge of edges) {
                const fromNode = this.nodes.get(edge.from)!;
                const toNode = this.nodes.get(edge.to)!;

                context.beginPath();
                context.moveTo(fromNode.position.x, fromNode.position.y);
                context.lineTo(toNode.position.x, toNode.position.y);
                context.stroke();
            }
        }

        // Draw the nodes
        context.fillStyle = 'orange';
        
        for (const node of this.nodes.values()) {
            context.beginPath();
            context.arc(node.position.x, node.position.y, 20, 0, Math.PI * 2);
            context.fill();
        }
    }
}