/**
 * Applies the saved appearance before first paint to avoid a flash of the
 * wrong theme. Runs synchronously in <head>; mirrors logic in useAppearance.
 */
export function ThemeScript() {
  const script = `(function(){try{var p=localStorage.getItem('cue_appearance')||'auto';var d=p==='dark'||(p==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
