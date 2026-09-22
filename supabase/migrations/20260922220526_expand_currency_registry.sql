-- Monatriq: expand the currency registry to comprehensive active fiat
-- coverage (P0-E2-S3).
--
-- P0-E2-S2 seeded public.currencies with 26 hand-picked codes. That was
-- explicitly a starting set, not comprehensive, and Monatriq must not be
-- Nigeria/curated-list-centric. This migration replaces the metadata for
-- every row (including the original 26, so there is exactly one
-- consistent source for all of them, not "26 hand-typed + 132 generated")
-- with data derived from a reliable maintained source rather than typed
-- from memory:
--
--   Source: ECMA-402 Intl API, backed by this machine's bundled ICU/CLDR
--   data at the time this migration was authored (Node v24.14.0, ICU
--   78.2, Unicode 17.0 -- `process.versions.icu`). ICU/CLDR is the
--   industry-standard maintained source for currency codes, display
--   names, and minor-unit (decimal) conventions; it is not hand-curated
--   here.
--
--   Method (reproducible -- see docs/architecture/MULTI_CURRENCY_MODEL.md
--   for the full write-up):
--     1. `Intl.supportedValuesOf('currency')` -- ICU's list of currency
--        codes it considers active/formattable. This already excludes
--        precious-metal codes (XAU/XAG/XPD/XPT) and the "no currency"/
--        testing placeholders (XXX/XTS).
--     2. Excluded two further non-spendable codes ICU still lists: XDR
--        (IMF Special Drawing Rights, a reserve/accounting unit, not a
--        spendable personal-finance currency) and XSU (Sucre, an ALBA
--        regional clearing unit, same reasoning). Genuine regional fiat
--        currencies that happen to use an "X" prefix (XAF, XCD, XCG,
--        XOF, XPF) are kept -- they are real, actively used money.
--     3. Excluded two superseded/historical codes whose CLDR display
--        name carries an explicit retirement date range: SLL ("Sierra
--        Leonean Leone (1964-2022)", replaced by SLE, which is kept) and
--        ZWL ("Zimbabwean Dollar (2009-2024)", replaced by ZWG, kept).
--     4. For each remaining code: display name via
--        `Intl.DisplayNames(['en'], {type:'currency'}).of(code)`; symbol
--        via `Intl.NumberFormat('en', {style:'currency', currency:code,
--        currencyDisplay:'symbol'})`'s formatted currency part (falls
--        back to the code itself when ICU has no distinct symbol for a
--        currency in the 'en' locale -- e.g. NGN, KES -- which is
--        expected and fine, since symbol is presentation metadata only,
--        never used for identity); decimal_exponent via that same
--        formatter's `maximumFractionDigits`, which is exactly the
--        "how many minor-unit digits does this currency actually use"
--        answer this column exists to hold.
--
--   Result: 158 currencies. Crypto is out of scope entirely (ISO 4217 /
--   ICU's currency list never included it to begin with -- nothing had
--   to be filtered out for that reason specifically).
--
-- This is idempotent and safe to re-run: ON CONFLICT (code) DO UPDATE
-- refreshes metadata for already-seeded rows rather than erroring or
-- duplicating.

insert into public.currencies (code, display_name, symbol, decimal_exponent) values
  ('AED', 'United Arab Emirates Dirham', 'AED', 2),
  ('AFN', 'Afghan Afghani', 'AFN', 0),
  ('ALL', 'Albanian Lek', 'ALL', 0),
  ('AMD', 'Armenian Dram', 'AMD', 2),
  ('ANG', 'Netherlands Antillean Guilder', 'ANG', 2),
  ('AOA', 'Angolan Kwanza', 'AOA', 2),
  ('ARS', 'Argentine Peso', 'ARS', 2),
  ('AUD', 'Australian Dollar', 'A$', 2),
  ('AWG', 'Aruban Florin', 'AWG', 2),
  ('AZN', 'Azerbaijani Manat', 'AZN', 2),
  ('BAM', 'Bosnia-Herzegovina Convertible Mark', 'BAM', 2),
  ('BBD', 'Barbadian Dollar', 'BBD', 2),
  ('BDT', 'Bangladeshi Taka', 'BDT', 2),
  ('BGN', 'Bulgarian Lev', 'BGN', 2),
  ('BHD', 'Bahraini Dinar', 'BHD', 3),
  ('BIF', 'Burundian Franc', 'BIF', 0),
  ('BMD', 'Bermudan Dollar', 'BMD', 2),
  ('BND', 'Brunei Dollar', 'BND', 2),
  ('BOB', 'Bolivian Boliviano', 'BOB', 2),
  ('BRL', 'Brazilian Real', 'R$', 2),
  ('BSD', 'Bahamian Dollar', 'BSD', 2),
  ('BTN', 'Bhutanese Ngultrum', 'BTN', 2),
  ('BWP', 'Botswanan Pula', 'BWP', 2),
  ('BYN', 'Belarusian Ruble', 'BYN', 2),
  ('BZD', 'Belize Dollar', 'BZD', 2),
  ('CAD', 'Canadian Dollar', 'CA$', 2),
  ('CDF', 'Congolese Franc', 'CDF', 2),
  ('CHF', 'Swiss Franc', 'CHF', 2),
  ('CLP', 'Chilean Peso', 'CLP', 0),
  ('CNY', 'Chinese Yuan', 'CN¥', 2),
  ('COP', 'Colombian Peso', 'COP', 0),
  ('CRC', 'Costa Rican Colón', 'CRC', 2),
  ('CUC', 'Cuban Convertible Peso', 'CUC', 2),
  ('CUP', 'Cuban Peso', 'CUP', 2),
  ('CVE', 'Cape Verdean Escudo', 'CVE', 2),
  ('CZK', 'Czech Koruna', 'CZK', 2),
  ('DJF', 'Djiboutian Franc', 'DJF', 0),
  ('DKK', 'Danish Krone', 'DKK', 2),
  ('DOP', 'Dominican Peso', 'DOP', 2),
  ('DZD', 'Algerian Dinar', 'DZD', 2),
  ('EGP', 'Egyptian Pound', 'EGP', 2),
  ('ERN', 'Eritrean Nakfa', 'ERN', 2),
  ('ETB', 'Ethiopian Birr', 'ETB', 2),
  ('EUR', 'Euro', '€', 2),
  ('FJD', 'Fijian Dollar', 'FJD', 2),
  ('FKP', 'Falkland Islands Pound', 'FKP', 2),
  ('GBP', 'British Pound', '£', 2),
  ('GEL', 'Georgian Lari', 'GEL', 2),
  ('GHS', 'Ghanaian Cedi', 'GHS', 2),
  ('GIP', 'Gibraltar Pound', 'GIP', 2),
  ('GMD', 'Gambian Dalasi', 'GMD', 2),
  ('GNF', 'Guinean Franc', 'GNF', 0),
  ('GTQ', 'Guatemalan Quetzal', 'GTQ', 2),
  ('GYD', 'Guyanaese Dollar', 'GYD', 2),
  ('HKD', 'Hong Kong Dollar', 'HK$', 2),
  ('HNL', 'Honduran Lempira', 'HNL', 2),
  ('HRK', 'Croatian Kuna', 'HRK', 2),
  ('HTG', 'Haitian Gourde', 'HTG', 2),
  ('HUF', 'Hungarian Forint', 'HUF', 0),
  ('IDR', 'Indonesian Rupiah', 'IDR', 0),
  ('ILS', 'Israeli New Shekel', '₪', 2),
  ('INR', 'Indian Rupee', '₹', 2),
  ('IQD', 'Iraqi Dinar', 'IQD', 0),
  ('IRR', 'Iranian Rial', 'IRR', 0),
  ('ISK', 'Icelandic Króna', 'ISK', 0),
  ('JMD', 'Jamaican Dollar', 'JMD', 2),
  ('JOD', 'Jordanian Dinar', 'JOD', 3),
  ('JPY', 'Japanese Yen', '¥', 0),
  ('KES', 'Kenyan Shilling', 'KES', 2),
  ('KGS', 'Kyrgyz Som', 'KGS', 2),
  ('KHR', 'Cambodian Riel', 'KHR', 2),
  ('KMF', 'Comorian Franc', 'KMF', 0),
  ('KPW', 'North Korean Won', 'KPW', 0),
  ('KRW', 'South Korean Won', '₩', 0),
  ('KWD', 'Kuwaiti Dinar', 'KWD', 3),
  ('KYD', 'Cayman Islands Dollar', 'KYD', 2),
  ('KZT', 'Kazakhstani Tenge', 'KZT', 2),
  ('LAK', 'Laotian Kip', 'LAK', 0),
  ('LBP', 'Lebanese Pound', 'LBP', 0),
  ('LKR', 'Sri Lankan Rupee', 'LKR', 2),
  ('LRD', 'Liberian Dollar', 'LRD', 2),
  ('LSL', 'Lesotho Loti', 'LSL', 2),
  ('LYD', 'Libyan Dinar', 'LYD', 3),
  ('MAD', 'Moroccan Dirham', 'MAD', 2),
  ('MDL', 'Moldovan Leu', 'MDL', 2),
  ('MGA', 'Malagasy Ariary', 'MGA', 0),
  ('MKD', 'Macedonian Denar', 'MKD', 2),
  ('MMK', 'Myanmar Kyat', 'MMK', 0),
  ('MNT', 'Mongolian Tugrik', 'MNT', 2),
  ('MOP', 'Macanese Pataca', 'MOP', 2),
  ('MRU', 'Mauritanian Ouguiya', 'MRU', 2),
  ('MUR', 'Mauritian Rupee', 'MUR', 2),
  ('MVR', 'Maldivian Rufiyaa', 'MVR', 2),
  ('MWK', 'Malawian Kwacha', 'MWK', 2),
  ('MXN', 'Mexican Peso', 'MX$', 2),
  ('MYR', 'Malaysian Ringgit', 'MYR', 2),
  ('MZN', 'Mozambican Metical', 'MZN', 2),
  ('NAD', 'Namibian Dollar', 'NAD', 2),
  ('NGN', 'Nigerian Naira', 'NGN', 2),
  ('NIO', 'Nicaraguan Córdoba', 'NIO', 2),
  ('NOK', 'Norwegian Krone', 'NOK', 2),
  ('NPR', 'Nepalese Rupee', 'NPR', 2),
  ('NZD', 'New Zealand Dollar', 'NZ$', 2),
  ('OMR', 'Omani Rial', 'OMR', 3),
  ('PAB', 'Panamanian Balboa', 'PAB', 2),
  ('PEN', 'Peruvian Sol', 'PEN', 2),
  ('PGK', 'Papua New Guinean Kina', 'PGK', 2),
  ('PHP', 'Philippine Peso', '₱', 2),
  ('PKR', 'Pakistani Rupee', 'PKR', 0),
  ('PLN', 'Polish Zloty', 'PLN', 2),
  ('PYG', 'Paraguayan Guarani', 'PYG', 0),
  ('QAR', 'Qatari Riyal', 'QAR', 2),
  ('RON', 'Romanian Leu', 'RON', 2),
  ('RSD', 'Serbian Dinar', 'RSD', 2),
  ('RUB', 'Russian Ruble', 'RUB', 2),
  ('RWF', 'Rwandan Franc', 'RWF', 0),
  ('SAR', 'Saudi Riyal', 'SAR', 2),
  ('SBD', 'Solomon Islands Dollar', 'SBD', 2),
  ('SCR', 'Seychellois Rupee', 'SCR', 2),
  ('SDG', 'Sudanese Pound', 'SDG', 2),
  ('SEK', 'Swedish Krona', 'SEK', 2),
  ('SGD', 'Singapore Dollar', 'SGD', 2),
  ('SHP', 'St. Helena Pound', 'SHP', 2),
  ('SLE', 'Sierra Leonean Leone', 'SLE', 2),
  ('SOS', 'Somali Shilling', 'SOS', 0),
  ('SRD', 'Surinamese Dollar', 'SRD', 2),
  ('SSP', 'South Sudanese Pound', 'SSP', 2),
  ('STN', 'São Tomé & Príncipe Dobra', 'STN', 2),
  ('SVC', 'Salvadoran Colón', 'SVC', 2),
  ('SYP', 'Syrian Pound', 'SYP', 0),
  ('SZL', 'Swazi Lilangeni', 'SZL', 2),
  ('THB', 'Thai Baht', 'THB', 2),
  ('TJS', 'Tajikistani Somoni', 'TJS', 2),
  ('TMT', 'Turkmenistani Manat', 'TMT', 2),
  ('TND', 'Tunisian Dinar', 'TND', 3),
  ('TOP', 'Tongan Paʻanga', 'TOP', 2),
  ('TRY', 'Turkish Lira', 'TRY', 2),
  ('TTD', 'Trinidad & Tobago Dollar', 'TTD', 2),
  ('TWD', 'New Taiwan Dollar', 'NT$', 2),
  ('TZS', 'Tanzanian Shilling', 'TZS', 2),
  ('UAH', 'Ukrainian Hryvnia', 'UAH', 2),
  ('UGX', 'Ugandan Shilling', 'UGX', 0),
  ('USD', 'US Dollar', '$', 2),
  ('UYU', 'Uruguayan Peso', 'UYU', 2),
  ('UZS', 'Uzbekistani Som', 'UZS', 2),
  ('VES', 'Venezuelan Bolívar', 'VES', 2),
  ('VND', 'Vietnamese Dong', '₫', 0),
  ('VUV', 'Vanuatu Vatu', 'VUV', 0),
  ('WST', 'Samoan Tala', 'WST', 2),
  ('XAF', 'Central African CFA Franc', 'FCFA', 0),
  ('XCD', 'East Caribbean Dollar', 'EC$', 2),
  ('XCG', 'Caribbean guilder', 'Cg.', 2),
  ('XOF', 'West African CFA Franc', 'F CFA', 0),
  ('XPF', 'CFP Franc', 'CFPF', 0),
  ('YER', 'Yemeni Rial', 'YER', 0),
  ('ZAR', 'South African Rand', 'ZAR', 2),
  ('ZMW', 'Zambian Kwacha', 'ZMW', 2),
  ('ZWG', 'Zimbabwean Gold', 'ZWG', 2)
on conflict (code) do update set
  display_name = excluded.display_name,
  symbol = excluded.symbol,
  decimal_exponent = excluded.decimal_exponent;
