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