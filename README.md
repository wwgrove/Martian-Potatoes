# Fieldwork 01: Martian Potatoes

A static 3D concept demo for a tracked Martian agriculture multi-tool. No account, server-side code, or build step is required.

## Run and publish

Serve this folder with any static web server (ES modules need HTTP, not `file://`). For local development, run `npm install` and `npm run serve`, then open `http://localhost:8080`. Publish the folder to a GitHub repository and enable GitHub Pages from the repository's root branch. All game assets, including Three.js, are local and paths are relative, so it also works under a GitHub Pages project subpath.

To preview on a phone on the same Wi-Fi, start the server on all network interfaces (for example `npx http-server . -a 0.0.0.0 -p 8081 -c-1`) and open `http://<computer-local-ip>:8081` on the phone. The computer's firewall and Wi-Fi network must allow the connection. This exposes the project folder to devices on that network; stop the server when finished.

## Controls

- WASD or arrow keys: move the astronaut and tracked tool relative to the camera. W / Up moves away from the camera; A / D move left / right in the view.
- Right-drag or Q / E and I / K: orbit and tilt the camera. Mouse wheel or `+` / `-`: zoom.
- Click a plot to target it; otherwise the nearest plot in reach is selected automatically. During digging, a floating blue diamond marks the selected diggable plot.
- Click an attachment or press `1`, `2`, `3` to change it. The astronaut opens the tool compartment and exchanges attachments.
- Hold Space: work on the highlighted plot. While digging, the astronaut walks the tool into alignment and the shovel pivots beneath the case; releasing Space stops the alignment and resets that plot's work. Follow the objective panel for the required attachment and activity.
- `R`: rest at night, watch a five-second habitat sequence, and advance crop growth by 90 seconds.
- On a small or touch device, drag the joystick to move, swipe the 3D view to orbit, tap a plot to target it and hold Work. Use the zoom, attachment and Rest buttons as needed. Release the joystick to stop moving and release Work to stop working.
- Select **Controls** for alternative on-screen buttons. Tap a direction to move and tap it again to stop; tap Work to start or stop working. Work stops automatically after a plot is complete. The panel also provides camera, zoom, and rest buttons. Selecting an attachment stops on-screen movement and work.
- Standard-mapped gamepad: left stick or D-pad moves, right stick orbits and tilts, triggers zoom, hold A / bottom button to work, B / right button rests, and bumpers change attachments. A starts the experience; Start opens or closes field notes. Browser and controller support varies; some browsers require a button press before the controller is detected.

There are 40 predefined plots. Soil changes from furrows to aeration marks, a planting hole, a planted mound, and darker wet soil as the tasks progress. Digging takes 3 seconds per plot, about 2 minutes of active work in total. The displayed 5× speed compares this with an assumed Mars work pace of 15 seconds per plot, the demo's previous timing. That baseline is illustrative, not a measured or validated estimate of real Martian digging performance. Other task durations are unchanged, and travel between plots adds time. Watered crops grow through five stages over 10 minutes of active play, with night rest providing a shortcut. The simulation pauses while the field notes are open or the browser is not rendering. Harvest the marked crops to complete the mission.

## Concept and limitations

Time, plant growth, and the day/night cycle are accelerated and simplified. The astronaut's stepping motion uses Mars surface gravity of 3.71 m/s² (about 0.38 Earth gravity); it is an illustrative gait, not a full simulation of rover traction, soil, plants, or human biomechanics. The demo assumes treated, nutrient-amended growing medium, a pressurized and climate-controlled dome, recycled water, root-zone irrigation, supplemental lighting, power, and life support. These are conceptual assumptions, not an operational procedure or a validated model of Martian agriculture. See the included research PDF for the project's system analysis and its stated assumptions.

The 3D view requires WebGL and a reasonably capable device; performance and controller support vary by browser and hardware. Progress is not saved when the page is reloaded.

## Development

Run `npm test` for the simulation tests. The checked-in `vendor` files are the Three.js 0.180.0 browser modules and license, copied from the package so the demo runs on GitHub Pages without a build or a CDN.
