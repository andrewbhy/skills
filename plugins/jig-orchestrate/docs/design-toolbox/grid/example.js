// Layout demonstration only; local messages are not persisted or sent anywhere.
const viewport = document.querySelector('#example-viewport');
const width = document.querySelector('#preview-width');
const dialog = document.querySelector('#example-dialog');
const content = document.querySelector('#sheet-content');
const chat = document.querySelector('#chat-content');
const chatRegion = document.querySelector('#chat-region');
let opener;
width.addEventListener('change', () => {
  viewport.style.setProperty('--example-width', width.value === 'auto' ? '100%' : `${width.value}px`);
  document.querySelector('#preview-status').textContent = width.value === 'auto' ? 'Fit window · widths are container sizes' : `${width.value} CSS px container · scroll to explore`;
});
document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => {
  opener = button;
  const region = button.dataset.open;
  document.querySelector('#sheet-title').textContent = { chat:'Release chat', workspace:'Workspace', notes:'Release notes' }[region];
  content.replaceChildren();
  if (region === 'chat') content.append(chat);
  else content.append(document.querySelector(region === 'workspace' ? '.grid-rail' : '.grid-second').cloneNode(true));
  // The cloned region has no hidden grid-shell parent, so it remains usable.
  dialog.toggleAttribute('data-compact', viewport.getBoundingClientRect().width < 600);
  dialog.showModal();
}));
document.querySelector('#sheet-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  chatRegion.append(chat);
  content.replaceChildren();
  opener?.focus();
});
document.querySelector('.example-composer').addEventListener('submit', event => {
  event.preventDefault();
  const input = event.target.elements.message;
  if (!input.value.trim()) return;
  const message = document.createElement('p');
  message.textContent = `You: ${input.value.trim()}`;
  chat.querySelector('[role="log"]').append(message);
  input.value = '';
  input.focus();
});
