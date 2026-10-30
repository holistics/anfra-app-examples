// The bridge from the plain-JavaScript screens to the React islands (web/src/ui). The dynamic import keeps React and
// the shadcn/ui components out of the main bundle: they load the first time a screen mounts an island.
export async function mountIsland(el, name, props) {
  const { mountIsland: mount } = await import('./ui/mount.tsx');
  return mount(el, name, props);
}
