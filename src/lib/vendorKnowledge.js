import compiledKnowledge from './vendorKnowledge.compiled.json';
import {
  compileVendorKnowledgeFromSourcePayloads,
  createVendorMatcher as createVendorMatcherCore,
  normalizeText,
  normalizeVendorKey,
  vendorMatchType,
} from './vendorKnowledgeCore';

export {
  compileVendorKnowledgeFromSourcePayloads,
  normalizeText,
  normalizeVendorKey,
  vendorMatchType,
};

export function createVendorMatcher(knowledge = compiledKnowledge) {
  return createVendorMatcherCore(knowledge);
}

export const vendorKnowledge = compiledKnowledge;
export const defaultVendorMatcher = createVendorMatcherCore(compiledKnowledge);
