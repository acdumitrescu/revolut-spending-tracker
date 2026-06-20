function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase();
}

export function buildSearchResults(transactions, query) {
  const needle = normalize(query);
  if (needle.length < 2) return [];

  const transactionMatches = transactions
    .filter((transaction) => [transaction.desc, transaction.cat, transaction.sub, transaction.matchedVendor]
      .some((value) => normalize(value).includes(needle)))
    .slice(0, 5)
    .map((transaction) => ({
      id: `transaction-${transaction.id}`,
      type: 'transaction',
      title: transaction.desc,
      meta: `${transaction.cat} · ${transaction.date}`,
      to: `/app/activity/transactions?q=${encodeURIComponent(query)}`,
    }));

  const vendors = new Map();
  const categories = new Map();
  transactions.forEach((transaction) => {
    const vendor = transaction.matchedVendor || transaction.desc;
    if (normalize(vendor).includes(needle) && !vendors.has(vendor)) {
      vendors.set(vendor, {
        id: `vendor-${vendor}`,
        type: 'vendor',
        title: vendor,
        meta: 'Vendor insight',
        to: '/app/insights/vendors',
      });
    }
    if (normalize(transaction.cat).includes(needle) && !categories.has(transaction.cat)) {
      categories.set(transaction.cat, {
        id: `category-${transaction.cat}`,
        type: 'category',
        title: transaction.cat,
        meta: 'Category insight',
        to: '/app/insights/categories',
      });
    }
  });

  return [...transactionMatches, ...vendors.values(), ...categories.values()].slice(0, 8);
}
