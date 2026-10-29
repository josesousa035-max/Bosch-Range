/// <reference lib="webworker" />
import { parseGpx } from "./gpx";
import { prepareTrack } from "./explorer";
import { validateRoute } from "./workspace";
self.onmessage = (event) => {
  try {
    const route =
      event.data.kind === "parse" ? parseGpx(event.data.xml) : event.data.route;
    validateRoute(route);
    const prepared = prepareTrack(route);
    self.postMessage({ route, prepared });
  } catch (error) {
    self.postMessage({ error: (error as Error).message });
  }
};
export {};
