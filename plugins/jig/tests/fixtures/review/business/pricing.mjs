export function discount(subtotal) {
  return subtotal >= 200 ? subtotal * 0.1 : 0;
}
