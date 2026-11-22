# Fieldwork 01: Martian Potatoes

A static 3D concept demo for a tracked Martian agriculture multi-tool. No account, server-side code, or build step is required.

## Run and publish

Serve this folder with any static web server (ES modules need HTTP, not `file://`). For local development, run `npm install` and `npm run serve`, then open `http://localhost:8080`. Publish the folder to a GitHub repository and enable GitHub Pages from the repository's root branch. All game assets, including Three.js, are local and paths are relative, so it also works under a GitHub Pages project subpath.

To preview on a phone on the same Wi-Fi, start the server on all network interfaces (for example `npx http-server . -a 0.0.0.0 -p 8081 -c-1`) and open `http://<computer-local-ip>:8081` on the phone. The computer's firewall and Wi-Fi network must allow the connection. This exposes the project folder to devices on that network; stop the server when finished.

## Controls

- WASD: move the astronaut and tracked tool relative to the camera. W moves away from the camera; A / D move left / right in the view.
- Arrow keys pan the camera across the ground; `C` recenters it on the astronaut.
- Right-drag or Q / E and I / K: orbit and tilt the camera. Mouse wheel or `+` / `-`: zoom.
- Click an eligible plot to target it from anywhere; otherwise the nearest eligible plot is selected automatically. A floating blue diamond marks the selected plot for every activity, even if the required attachment is not yet selected.
- Click an attachment or press `1`, `2`, `3`, `4` to change it. Hover, focus or tap an attachment to learn its purpose. The astronaut opens the sealed tool caddy and exchanges the rotary tiller, furrowing and hilling plow, mixing auger, or vibratory lifter.
- Press `F`, select **Park tool**, or press gamepad B to leave the machine and walk independently. Return to its handle and use the same control to pick it up.
- While walking independently, the astronaut faces the direction of travel and turns with the camera when standing still.
- Nearby interaction prompts identify the key or control for the machine handle, irrigation switch, habitat door, and workable plots.
- During either irrigation objective, park the machine, walk to the blue marker at the white cabinet, and press Space, Work, or gamepad A at its switch. Sprinklers water the whole field for five seconds and stop automatically; the second cycle becomes available once all plots reach the growth checkpoint.
- Hold Space: approach the highlighted plot, work, then automatically continue through eligible plots in a loose back-and-forth row pattern. The machine turns on its tracks before driving forward, with the astronaut following behind. Releasing Space stops the approach or work and resets that plot's work. Release and press again after an objective completes. Follow the objective panel for the required attachment and activity.
- A field-guide infographic appears during each operation to explain why that tool or action is needed at that stage.
- Once the harvest is complete, select the rotary tiller to prepare the next crop. The field begins a new cycle while time, position and the cumulative harvest are preserved.
- At night, approach the glowing habitat door and press Space or Work to rest. A five-second habitat sequence advances crop growth by up to 15 seconds, subject to the next required checkpoint.
- On a small or touch device, drag the joystick to move, swipe the 3D view to orbit, tap a plot to target it and hold Work. Use the zoom and attachment buttons as needed; tap Work at the door to rest. Release the joystick to stop moving and release Work to stop working.
- Select **Controls** for alternative on-screen buttons. Tap a direction to move and tap it again to stop; tap Work to start or stop the automatic sequence, or to rest at the door. Work stops automatically after an objective is complete. The panel also provides camera and zoom buttons. Selecting an attachment stops on-screen movement and work.
- Standard-mapped gamepad: left stick or D-pad moves, right stick orbits and tilts, triggers zoom, hold A / bottom button to work or press it at the door to rest, and bumpers change attachments. A starts the experience; Start opens or closes field notes. Browser and controller support varies; some browsers require a button press before the controller is detected.

There are 20 plots. Till, furrow, drill, plant and start the sprinklers; then hill the growing shoots, run the second irrigation cycle during tuber development, and harvest with the lifter. The astronaut takes seed potatoes from the bin beneath the tool caddy and plants them by hand. Planting takes 3 seconds per plot; other field activities take 0.8–1.2 seconds per plot, plus automatic approach, travel and tool changes. Each field-wide sprinkler cycle takes five seconds. After irrigation starts, crops grow through five stages over 30 seconds per plot, pausing at the hilling and irrigation checkpoints until serviced. The simulation pauses while the field notes are open or the browser is not rendering.

The two interactive sprinkler cycles represent initial watering and a mid-growth check; additional irrigation is assumed to continue between them and afterward. They are not the only two waterings of a real crop. [University of Minnesota Extension](https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/growing-potatoes) advises consistent moisture, roughly an inch of water per week, and watering once or twice weekly, more often in sandy soils. The demo does not simulate water quantities or prescribe an irrigation schedule for Mars; a real habitat would need moisture sensing and site-specific calibration.

## Concept and limitations

Time, plant growth, and the day/night cycle are accelerated and simplified. The astronaut's distance-based walking animation is illustrative, not a physical simulation of movement in Mars gravity. The demo does not fully simulate rover traction, soil, plants, or human biomechanics. It assumes treated, nutrient-amended growing medium, a pressurized and climate-controlled dome, recycled water, root-zone irrigation, supplemental lighting, power, and life support. These are conceptual assumptions, not an operational procedure or a validated model of Martian agriculture. See the included research PDF for the project's system analysis and its stated assumptions.

The 3D view requires WebGL and a reasonably capable device; performance and controller support vary by browser and hardware. Progress, crop growth, time, machine and parked astronaut positions, the selected attachment, and an active sprinkler countdown save automatically in the current browser on this device. Partially completed plot work and an in-progress tool exchange restart on reload. Saves do not sync across browsers or devices and may be deleted when site data is cleared. The mission panel reports storage errors; an invalid save is not overwritten.

## Development

Run `npm test` for the simulation tests. The checked-in `vendor` files are the Three.js 0.180.0 browser modules and license, copied from the package so the demo runs on GitHub Pages without a build or a CDN.
