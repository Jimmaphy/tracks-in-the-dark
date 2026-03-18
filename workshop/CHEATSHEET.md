# Tracks in the Dark - Cheatsheet for Presentor


## Chapter 1: Basic Graph
- What is a graph?
- What components are used in a graph?
- How to implement a graph in TypeScript?

```ts
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
```

```ts
import { Graph } from './graph.js'

const graph = new Graph();

graph.addNode("A");
graph.addNode("B");
graph.addNode("C");

graph.addEdge("A", "B");
graph.addEdge("B", "C");
graph.addEdge("A", "C");

graph.addEdge("D", "A");

const connections = graph.getConnections("A");

connections.forEach(edge => {
    console.log(`A --> ${edge.to}`);
});
```


## Visualization of the Graph
- Positioning the nodes
- Drawing the nodes
- Drawing edges under the nodes
- Visualizing directed edges with arrows

```ts
export interface Position {
    x: number;
    y: number;
}

export interface Node {
    id: NodeId;
    position: Position;
}

export class Graph {
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
```

```ts
import { Graph } from './graph.js'

window.onload = () => {
    console.log('hello world');
    const graph = new Graph();
    const canvas = document.getElementById("graph") as HTMLCanvasElement;
    
    graph.addNode("A", { x: 0, y: 250 });
    graph.addNode("B", { x: 100, y: 250 });
    graph.addNode("C", { x: 125, y: 200 });
    graph.addNode("D", { x: 125, y: 300 });
    graph.addNode("E", { x: 375, y: 200 });
    graph.addNode("F", { x: 375, y: 300 });
    graph.addNode("G", { x: 400, y: 250 });
    graph.addNode("H", { x: 500, y: 250 });

    graph.addEdge("A", "B");
    graph.addEdge("B", "C");
    graph.addEdge("B", "D");
    graph.addEdge("C", "E");
    graph.addEdge("D", "F");
    graph.addEdge("E", "G");
    graph.addEdge("F", "G");
    graph.addEdge("G", "H");

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    
    graph.render(canvas);
}
```


## Transition to rail networks

- Adding cars on the tracks
- Changing the color of the track based on the number of cars

```ts
export interface Track {
    from: NodeId;
    to: NodeId;
    cars: number;
}

// Set the color and width of the track based on the number of cars
context.strokeStyle = track.cars > 0 ? 'red' : 'white';
context.fillStyle = track.cars > 0 ? 'red' : 'white';
context.lineWidth = 2;
```

## Other implementations of graphs

- Social networks
- Road networks
- Frequently bought together
- Category Theory
- Data Science