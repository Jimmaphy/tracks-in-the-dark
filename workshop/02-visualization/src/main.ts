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
})