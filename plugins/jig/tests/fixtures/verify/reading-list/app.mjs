import { addItem } from './items.mjs';

const form = document.querySelector('form');
const input = document.querySelector('#title');
const list = document.querySelector('#items');
const error = document.querySelector('#error');
let items = [];

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const result = addItem(items, input.value);
  error.textContent = result.error ?? '';
  input.setAttribute('aria-invalid', String(Boolean(result.error)));
  if (result.error) return;
  items = result.items;
  list.replaceChildren(...items.map((item) => {
    const row = document.createElement('li');
    row.textContent = item.title;
    return row;
  }));
  input.value = '';
  input.focus();
});
