import { describe, expect, it } from 'vitest';
import { parseCSV } from '../lib/csvParser';
import personalFixture from './fixtures/synthetic-personal-profile.csv?raw';
import businessFixture from './fixtures/synthetic-business-profile.csv?raw';
import businessExpenseFixture from './fixtures/synthetic-business-expense-ro.csv?raw';
import normalizedFixture from './fixtures/synthetic-normalized-profile.csv?raw';
import demoFixture from '../../public/demo-revolut.csv?raw';

// Golden files: every supported export profile has a synthetic CSV and a checked-in
// expected parse. A parser change shows up as a diff in src/test/fixtures/golden/.
// After reviewing an intended change, refresh with: npx vitest run csvParserGolden -u
const cases = [
  ['revolut-personal-raw', 'synthetic-personal-profile', personalFixture],
  ['revolut-business-transaction', 'synthetic-business-profile', businessFixture],
  ['revolut-business-expense', 'synthetic-business-expense-ro', businessExpenseFixture],
  ['normalized-csv', 'synthetic-normalized-profile', normalizedFixture],
  ['revolut-personal-raw', 'demo-csv', demoFixture],
];

describe('CSV parser golden files', () => {
  it.each(cases)('%s profile parses %s exactly as recorded', async (profileId, name, contents) => {
    const result = await parseCSV(new File([contents], `${name}.csv`, { type: 'text/csv' }));
    expect(result.summary.detectedProfileId).toBe(profileId);
    await expect(`${JSON.stringify(result, null, 2)}\n`).toMatchFileSnapshot(
      `./fixtures/golden/${name}.json`,
    );
  });
});
