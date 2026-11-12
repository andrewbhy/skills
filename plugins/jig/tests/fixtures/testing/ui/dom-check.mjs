export function checkDOM(document) {
  const total = document.getElementById('total');
  const pay = document.getElementById('pay');
  return total?.textContent === 'Total: $20.00' && pay?.textContent === 'Pay' && !pay.disabled;
}
