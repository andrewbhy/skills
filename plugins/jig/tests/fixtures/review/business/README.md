# Campaign pricing

Task: lower the campaign discount threshold from 200 to 100, inclusive. Give
10 percent off the subtotal at or above the threshold, and zero below it.

Acceptance: discount(99) is 0; discount(100) is 10; discount(200) is 20.
Run checks with `node --test`. Product direction is in VISION.md.
