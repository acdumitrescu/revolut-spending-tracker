import { describe, expect, it } from 'vitest';
import {
  compileVendorKnowledgeFromSourcePayloads,
  createVendorMatcher,
  normalizeVendorKey,
} from '../lib/vendorKnowledge';

describe('vendorKnowledge compiler', () => {
  it('normalizes aliases by removing legal and payment noise', () => {
    expect(normalizeVendorKey('Netflix SRL POS 884422')).toBe('netflix');
  });

  it('merges duplicate source records deterministically and lets manual overrides win', () => {
    const payloads = [
      {
        sourceType: 'nsi',
        records: [{
          id: 'ro-digi',
          canonicalName: 'Digi',
          aliases: ['digi'],
          regions: ['RO'],
          category: 'Telecom',
          subcategory: 'Mobile',
          priority: 80,
          tags: ['telecom'],
        }],
      },
      {
        sourceType: 'manual',
        records: [{
          id: 'ro-digi',
          canonicalName: 'Digi',
          aliases: ['rcs rds'],
          regions: ['RO'],
          category: 'Telecom',
          subcategory: 'Internet & TV',
          priority: 95,
          tags: ['telecom', 'internet'],
        }],
      },
    ];

    const compiled = compileVendorKnowledgeFromSourcePayloads(payloads);
    expect(compiled.records).toHaveLength(1);
    expect(compiled.records[0].category).toBe('Utilities');
    expect(compiled.records[0].subcategory).toBe('Internet & TV');
    expect(compiled.records[0].normalizedAliases).toEqual(['digi', 'rcs rds']);
    expect(compiled.records[0].searchKeys).toEqual(['digi', 'rcs rds']);
    expect(compiled.records[0].sourceEvidence).toEqual(['manual', 'nsi']);
  });

  it('produces a stable compiled contract across reruns', () => {
    const payloads = [{
      sourceType: 'manual',
      records: [{
        id: 'ro-test',
        canonicalName: 'Test Store',
        aliases: ['test store'],
        regions: ['RO'],
        category: 'Shopping',
        subcategory: 'General',
        priority: 50,
        tags: ['shopping'],
      }],
    }];

    expect(compileVendorKnowledgeFromSourcePayloads(payloads)).toEqual(
      compileVendorKnowledgeFromSourcePayloads(payloads)
    );
  });
});

describe('vendorKnowledge matcher', () => {
  const matcher = createVendorMatcher();

  it('matches exact Romanian chains from compiled knowledge', () => {
    const result = matcher.classifyVendor('Mega Image', -45);
    expect(result.category).toBe('Groceries');
    expect(result.subcategory).toBe('Supermarket');
    expect(result.matchedVendorId).toBe('ro-mega-image');
    expect(result.matchSource).toBe('built-in-exact');
  });

  it('uses boundary-safe matches instead of accidental substrings', () => {
    const result = matcher.classifyVendor('xxboltxx', -20);
    expect(result.category).toBe('Other');
    expect(result.matchSource).toBe('none');
  });

  it('resolves family conflicts in favor of stronger direct aliases', () => {
    const result = matcher.classifyVendor('Uber Eats order 55', -20);
    expect(result.category).toBe('Food & Dining');
    expect(result.subcategory).toBe('Delivery');
    expect(result.matchedVendor).toBe('Uber Eats');
  });

  it('lets custom overrides beat built-in matches', () => {
    const result = matcher.classifyVendor('Uber Eats', -20, {
      'uber eats': ['CustomFood', 'Manual'],
    });
    expect(result.category).toBe('CustomFood');
    expect(result.matchSource).toBe('custom');
  });

  it('accepts obvious fuzzy Romanian merchants without exact aliases', () => {
    const groceries = matcher.classifyVendor('kauflan', -35);
    expect(groceries.category).toBe('Groceries');
    expect(groceries.subcategory).toBe('Hypermarket');
    expect(groceries.matchSource).toBe('fuzzy');

    const fuel = matcher.classifyVendor('rompetroll', -28);
    expect(fuel.category).toBe('Transport');
    expect(fuel.subcategory).toBe('Fuel');
    expect(fuel.matchSource).toBe('fuzzy');
  });

  it('rejects ambiguous short fuzzy terms without enough evidence', () => {
    const result = matcher.classifyVendor('mol', -15);
    expect(result.category).toBe('Other');
    expect(result.matchSource).toBe('none');
  });

  it('falls back to Other when no safe match exists', () => {
    const result = matcher.classifyVendor('unknown local kiosk', -9);
    expect(result.category).toBe('Other');
    expect(result.subcategory).toBe('');
  });
});
