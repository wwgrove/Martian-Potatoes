# Fieldwork 01: Martian Potatoes

A desktop-first, static 3D concept demo for a tracked Martian agriculture multi-tool. No account, server-side code, or build step is required.

## Run and publish

Serve this folder with any static web server (ES modules need HTTP, not `file://`). For local development, run `npm install` and `npm run serve`, then open `http://localhost:8080`. Publish the folder to a GitHub repository and enable GitHub Pages from the repository's root branch. All game assets, including Three.js, are local and paths are relative, so it also works under a GitHub Pages project subpath.

## Controls

- WASD or arrow keys: move the astronaut and tracked tool relative to the camera. W / Up moves away from the camera; A / D move left / right in the view.
- Right-drag: orbit the camera. Mouse wheel or `+` / `-`: zoom.
- Click a plot to target it; otherwise the nearest plot in reach is selected automatically. During digging, a floating blue diamond marks the selected diggable plot.
- Click an attachment or press `1`, `2`, `3` to change it. The astronaut opens the tool compartment and exchanges attachments.
- Hold Space: work on the highlighted plot. While digging, the astronaut walks the tool into alignment and the shovel pivots beneath the case; releasing Space stops the alignment and resets that plot's work. Follow the objective panel for the required attachment and activity.
- `R`: rest at night, watch a five-second habitat sequence, and advance crop growth by 90 seconds.

There are 40 predefined plots. Soil changes from furrows to aeration marks, a planting hole, a planted mound, and darker wet soil as the tasks progress. Digging takes 3 seconds per plot, about 2 minutes of active work in total. The displayed 5× speed compares this with an assumed Mars work pace of 15 seconds per plot, the demo's previous timing. That baseline is illustrative, not a measured or validated estimate of real Martian digging performance. Other task durations are unchanged, and travel between plots adds time. Watered crops grow through five stages over 10 minutes of active play, with night rest providing a shortcut. The simulation pauses while the field notes are open or the browser is not rendering. Harvest the marked crops to complete the mission.

## Concept and limitations

Time, plant growth, and the day/night cycle are accelerated and simplified. The astronaut's stepping motion uses Mars surface gravity of 3.71 m/s² (about 0.38 Earth gravity); it is an illustrative gait, not a full simulation of rover traction, soil, plants, or human biomechanics. The demo assumes treated, nutrient-amended growing medium, a pressurized and climate-controlled dome, recycled water, root-zone irrigation, supplemental lighting, power, and life support. These are conceptual assumptions, not an operational procedure or a validated model of Martian agriculture. See the included research PDF for the project's system analysis and its stated assumptions.

This version targets desktop keyboard and mouse. Responsive layout is included, but dedicated touch, controller, and mobile performance support are future work. Progress is not saved when the page is reloaded.

## Development

Run `npm test` for the simulation tests. The checked-in `vendor` files are the Three.js 0.180.0 browser modules and license, copied from the package so the demo runs on GitHub Pages without a build or a CDN.
