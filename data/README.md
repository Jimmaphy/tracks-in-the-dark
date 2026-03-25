# Tracks in the Dark - Data

This directory contains data files that you may need for your project.
Each file surves a specific purpose and is organized in a way to help you easily find what you need.
This README.md file provides an overview of the contents of the `data/` directory and how to use the files within it.

*Disclaimer:* everything provided in the `data/` directory is completely fictional.
Data like identifiers, adr-codes, yard-layout, locations etc. are all made up for the purpose of the hackathon.
Structure of the data does is no way represent their real-world counterparts.
Information is simplified to be fun to work with in a hackathon setting.
Any resemblance to real-world data is purely coincidental.


## cars.json

The `cars.json` file contains information about the cars that are used in all projects.
Each car has a unique identifier, a type, content, and adr-code.
The type describes the type of car, such as `boxcar`, `flatbed`, `engine`, etc.
The content describes what the car is carrying, such as `water`, `nissan-ev hz-livery`, etc.
The adr-code is a code that describes the type of content, such as `3` for flammable liquids, `8` for corrosive substances, etc.


## log.*.json

The `log.*.json` files contain the log data for each run of the simulation.
Each file corresponds to a different run and complexity of the simulation.
They can be used for both the simulation and the visualization.
The following files are included:

- `log.basic.json`: Contains a basic run, with a single train. It leaves a 20 axles in the yard.
- `log.medium.json`: Adds direction to the axle counter data, having the engine leave the yard where it entered.
- `log.advanced.json`: Adds more trains, adding emplacement operations.
- `log.advanced.broken.json`: A broken log file, with missing data and inconsistencies.
  - Missing data: a sensor didn't trigger, so there is no log entry for it.
  - Miscount: a sensor triggered, but the data is incorrect.
  - Clock drift: the timestamps are not consistent.
  - Sensor failure: a worker removed a sensor and put it back incorrectly, it now triggers the wrong way.
- `log.expert.json`: Adds schedule and car information to the log; requires merging data with `schedule.json` and `cars.json` to get.
- `log.expert.broken.json`: A broken log file, with missing data and inconsistencies.


## points.json

The `points.json` file contains x and y coordinates for connector in the yard.
The coordinates are used for the visualization, to place the connectors in the correct position.
It uses the coordination system used by the HTML Canvas element, where the origin (0, 0) is in the top left corner, the x-axis goes to the right, and the y-axis goes downwards.
The connectors match those provided in the `yard.json` file.
The maximum value for x is 500, the maximum value for y is 200.


## schedule.json

A schedule is a list of train scheduled to arrive and depart from the yard.
Each entry is a single movement on the yard, which is identified by the type.
These can be `delivery`, `pickup`, `emplacement` and `transit`.
A delivery is a train that arrives to deliver card, pickup is the opposite of that.
An emplacement is a train that moves within the yard, and a transit is a train that passes through the yard.


## yard.json

The `yard.json` file contains information about the layout of the yard.
Its purpose is to provide information as a data structure, *not* as a visual representation.

After the name of the yard, a list of sensors is provided.
There are three types of sensors: `axle_counter`, `camera` and `switch_sensor`.
The axle counter count the number of axles that pass by.
The camera sensors capture train identification as they pass, like speed cameras do for cars.
The switch sensors detect the state of the switches in the yard.

Following the sensors, a list of tracks is provided.
Each track has a name, an incoming axle_counter, an outgoing axle_counter, camera, and a type.
A track can be a `main` track, for driving, a `siding` for emplacement purposes, or an `edge` for tracks that enter or leave the yard. 
Only edges are provided with a camera, as they are the only tracks that can capture train identification.

Finally, a list of connections is provided.
A connection has a name, a list of incoming tracks, a list of outgoing tracks, and a type.
The type of a connection can be `switch` and `corner`, which are rather self-explanatory.
A corner always has a single incoming and outgoing track, while a switch can have multiple incoming and outgoing tracks.
In case of a switch, the total number of tracks is always 3.
The first items in both the incoming and outgoing tracks are the straight track, the second item is the diverging track.