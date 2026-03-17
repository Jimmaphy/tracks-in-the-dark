import { Graph } from './graph.js'

window.onload = () => {
    console.log('hello world');
    const graph = new Graph();
    const canvas = document.getElementById("graph") as HTMLCanvasElement;
    
    graph.addNode("A", { x: 125, y: 150 });
    graph.addNode("B", { x: 250, y: 300 });
    graph.addNode("C", { x: 375, y: 150 });
    
    graph.addEdge("A", "B");
    graph.addEdge("B", "C");
    graph.addEdge("A", "C");

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    
    graph.render(canvas);
}