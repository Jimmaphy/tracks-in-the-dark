export type NodeId = string;

export interface Node {
    id: NodeId;
}

export interface Edge {
    from: NodeId;
    to: NodeId;
}

export class Graph {
    private nodes = new Map<NodeId, Node>();
    private connections = new Map<NodeId, Edge[]>();

    addNode(id: NodeId): void {
        this.nodes.set(id, { id });
        this.connections.set(id, []);
    }

    addEdge(from: NodeId, to: NodeId): void {
        this.connections.get(from)?.push({ from, to });
    }

    getConnections(id: NodeId): Edge[] {
        return this.connections.get(id) ?? [];
    }
}