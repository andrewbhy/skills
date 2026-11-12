# Task

Review the baseline to candidate change, including architecture/testability.
The task was to add a repeated-run check without growing the fast suite beyond
its existing budget. Run `node --test test/*.test.mjs`. Project policy:
every test title names its risk; reduce or merge tests when over budget.
Use `.jig/testing.json` with the test-budget helper. Do not change the budget.
