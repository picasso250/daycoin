// Preserve reading anchors between languages; switching pages never requests wallet access.
const link = document.querySelector('.language-switch');
function update() {
  if (link) { const target = new URL(link.href); target.hash = location.hash; link.href = target.href; }
}
update();
addEventListener('hashchange', update);
