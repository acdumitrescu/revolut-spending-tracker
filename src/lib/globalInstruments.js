function stock(ticker, name) {
  return {
    ticker,
    quoteSymbol: ticker,
    name,
    exchange: 'US',
    market: 'Curated',
    currency: 'USD',
    assetClass: 'Stock',
  };
}

function etf(ticker, name) {
  return {
    ticker,
    quoteSymbol: ticker,
    name,
    exchange: 'US',
    market: 'Curated',
    currency: 'USD',
    assetClass: 'ETF',
  };
}

export const globalInstruments = [
  ['AAPL', 'Apple Inc.'], ['MSFT', 'Microsoft Corporation'], ['NVDA', 'NVIDIA Corporation'],
  ['AMZN', 'Amazon.com, Inc.'], ['GOOGL', 'Alphabet Inc. Class A'], ['GOOG', 'Alphabet Inc. Class C'],
  ['META', 'Meta Platforms, Inc.'], ['TSLA', 'Tesla, Inc.'], ['AVGO', 'Broadcom Inc.'],
  ['NFLX', 'Netflix, Inc.'], ['ORCL', 'Oracle Corporation'], ['ADBE', 'Adobe Inc.'],
  ['CRM', 'Salesforce, Inc.'], ['AMD', 'Advanced Micro Devices, Inc.'], ['INTC', 'Intel Corporation'],
  ['QCOM', 'QUALCOMM Incorporated'], ['TXN', 'Texas Instruments Incorporated'], ['IBM', 'International Business Machines Corporation'],
  ['NOW', 'ServiceNow, Inc.'], ['PLTR', 'Palantir Technologies Inc.'], ['PANW', 'Palo Alto Networks, Inc.'],
  ['CRWD', 'CrowdStrike Holdings, Inc.'], ['SNOW', 'Snowflake Inc.'], ['SHOP', 'Shopify Inc.'],
  ['UBER', 'Uber Technologies, Inc.'], ['ABNB', 'Airbnb, Inc.'], ['BRK-B', 'Berkshire Hathaway Inc. Class B'],
  ['JPM', 'JPMorgan Chase & Co.'], ['V', 'Visa Inc.'], ['MA', 'Mastercard Incorporated'],
  ['BAC', 'Bank of America Corporation'], ['WFC', 'Wells Fargo & Company'], ['GS', 'Goldman Sachs Group, Inc.'],
  ['MS', 'Morgan Stanley'], ['BLK', 'BlackRock, Inc.'], ['SCHW', 'Charles Schwab Corporation'],
  ['AXP', 'American Express Company'], ['C', 'Citigroup Inc.'], ['LLY', 'Eli Lilly and Company'],
  ['UNH', 'UnitedHealth Group Incorporated'], ['JNJ', 'Johnson & Johnson'], ['ABBV', 'AbbVie Inc.'],
  ['MRK', 'Merck & Co., Inc.'], ['PFE', 'Pfizer Inc.'], ['AMGN', 'Amgen Inc.'],
  ['TMO', 'Thermo Fisher Scientific Inc.'], ['DHR', 'Danaher Corporation'], ['ISRG', 'Intuitive Surgical, Inc.'],
  ['WMT', 'Walmart Inc.'], ['COST', 'Costco Wholesale Corporation'], ['HD', 'Home Depot, Inc.'],
  ['MCD', 'McDonald’s Corporation'], ['NKE', 'NIKE, Inc.'], ['SBUX', 'Starbucks Corporation'],
  ['KO', 'Coca-Cola Company'], ['PEP', 'PepsiCo, Inc.'], ['PG', 'Procter & Gamble Company'],
  ['PM', 'Philip Morris International Inc.'], ['MO', 'Altria Group, Inc.'], ['LOW', 'Lowe’s Companies, Inc.'],
  ['TGT', 'Target Corporation'], ['BKNG', 'Booking Holdings Inc.'], ['MAR', 'Marriott International, Inc.'],
  ['RCL', 'Royal Caribbean Group'], ['DIS', 'Walt Disney Company'], ['CMCSA', 'Comcast Corporation'],
  ['GE', 'GE Aerospace'], ['CAT', 'Caterpillar Inc.'], ['DE', 'Deere & Company'],
  ['HON', 'Honeywell International Inc.'], ['RTX', 'RTX Corporation'], ['LMT', 'Lockheed Martin Corporation'],
  ['BA', 'Boeing Company'], ['UPS', 'United Parcel Service, Inc.'], ['FDX', 'FedEx Corporation'],
  ['UNP', 'Union Pacific Corporation'], ['CSX', 'CSX Corporation'], ['NSC', 'Norfolk Southern Corporation'],
  ['XOM', 'Exxon Mobil Corporation'], ['CVX', 'Chevron Corporation'], ['COP', 'ConocoPhillips'],
  ['SLB', 'SLB Limited'], ['EOG', 'EOG Resources, Inc.'], ['OXY', 'Occidental Petroleum Corporation'],
  ['T', 'AT&T Inc.'], ['VZ', 'Verizon Communications Inc.'], ['TMUS', 'T-Mobile US, Inc.'],
  ['TSM', 'Taiwan Semiconductor Manufacturing Company Limited'], ['ASML', 'ASML Holding N.V.'],
  ['NVO', 'Novo Nordisk A/S'], ['SAP', 'SAP SE'], ['RY', 'Royal Bank of Canada'],
  ['TM', 'Toyota Motor Corporation'], ['BABA', 'Alibaba Group Holding Limited'], ['PDD', 'PDD Holdings Inc.'],
  ['JD', 'JD.com, Inc.'], ['MELI', 'MercadoLibre, Inc.'], ['SE', 'Sea Limited'],
].map(([ticker, name]) => stock(ticker, name));

export const globalEtfs = [
  ['SPY', 'SPDR S&P 500 ETF Trust'], ['VOO', 'Vanguard S&P 500 ETF'], ['IVV', 'iShares Core S&P 500 ETF'],
  ['QQQ', 'Invesco QQQ Trust'], ['VTI', 'Vanguard Total Stock Market ETF'], ['VT', 'Vanguard Total World Stock ETF'],
  ['VXUS', 'Vanguard Total International Stock ETF'], ['IWM', 'iShares Russell 2000 ETF'], ['DIA', 'SPDR Dow Jones Industrial Average ETF Trust'],
  ['SCHD', 'Schwab U.S. Dividend Equity ETF'], ['VYM', 'Vanguard High Dividend Yield ETF'], ['VUG', 'Vanguard Growth ETF'],
  ['VTV', 'Vanguard Value ETF'], ['BND', 'Vanguard Total Bond Market ETF'], ['AGG', 'iShares Core U.S. Aggregate Bond ETF'],
  ['TLT', 'iShares 20+ Year Treasury Bond ETF'], ['GLD', 'SPDR Gold Shares'], ['IAU', 'iShares Gold Trust'],
  ['SLV', 'iShares Silver Trust'], ['USO', 'United States Oil Fund, LP'], ['XLK', 'Technology Select Sector SPDR Fund'],
  ['XLF', 'Financial Select Sector SPDR Fund'], ['XLV', 'Health Care Select Sector SPDR Fund'], ['XLE', 'Energy Select Sector SPDR Fund'],
  ['XLI', 'Industrial Select Sector SPDR Fund'], ['XLY', 'Consumer Discretionary Select Sector SPDR Fund'],
  ['XLP', 'Consumer Staples Select Sector SPDR Fund'], ['XLU', 'Utilities Select Sector SPDR Fund'], ['XLRE', 'Real Estate Select Sector SPDR Fund'],
  ['SOXX', 'iShares Semiconductor ETF'], ['SMH', 'VanEck Semiconductor ETF'], ['ARKK', 'ARK Innovation ETF'],
  ['EEM', 'iShares MSCI Emerging Markets ETF'], ['VWO', 'Vanguard FTSE Emerging Markets ETF'],
  ['EWJ', 'iShares MSCI Japan ETF'], ['EWZ', 'iShares MSCI Brazil ETF'], ['EWG', 'iShares MSCI Germany ETF'],
  ['EWC', 'iShares MSCI Canada ETF'], ['EWH', 'iShares MSCI Hong Kong ETF'], ['INDA', 'iShares MSCI India ETF'],
].map(([ticker, name]) => etf(ticker, name));
