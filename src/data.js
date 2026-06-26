/**
 * @fileoverview Seed data and date helpers for Threadsmiitit.
 *
 * MEETUPS is the read-only seed list; user-added meetups live in EventStore.
 * DH provides date formatting and comparison utilities.
 */

/** @type {string[]} Finnish month names in nominative case. */
export const MONTHS_FI = [
  'tammikuu',
  'helmikuu',
  'maaliskuu',
  'huhtikuu',
  'toukokuu',
  'kesäkuu',
  'heinäkuu',
  'elokuu',
  'syyskuu',
  'lokakuu',
  'marraskuu',
  'joulukuu',
];

/** @type {Record<string, {label: string, color: string}>} */
export const CATEGORIES = {
  karaoke: { label: 'Karaoke', color: '#C7507A' },
  liikunta: { label: 'Liikunta', color: '#3F8E6E' },
  pelit: { label: 'Pelit', color: '#5A6FC0' },
  ruokajuoma: { label: 'Ruoka & juoma', color: '#C77A2E' },
  sauna: { label: 'Sauna', color: '#9A6A40' },
  sinkut: { label: 'Sinkut', color: '#A14FB0' },
  kulttuuri: { label: 'Kulttuuri', color: '#4E7FA8' },
  illanvietto: { label: 'Illanvietto', color: '#C95B52' },
  yleinen: { label: 'Yleinen', color: '#7A776F' },
};

/**
 * @typedef {object} CityRecord
 * @property {string} key - URL-safe identifier used as a lookup key.
 * @property {string} name - Full display name (may include surrounding area note).
 * @property {string} short - Short display name shown in the UI.
 * @property {string} [note] - Optional descriptive note about the area.
 * @property {string} [account] - Optional Threads account handle for the city.
 */

/**
 * Seed cities. Additional cities may be appended at runtime by EventStore
 * when users add meetups in unlisted municipalities.
 *
 * @type {CityRecord[]}
 */
export const CITIES = [
  {
    key: 'helsinki',
    name: 'Helsinki ja pk-seutu',
    short: 'Helsinki',
    note: 'Espoo, Kauniainen ja Vantaa mukana. Kirkkonummi, Vihti, Nurmijärvi, Hyvinkää, Tuusula, Kerava ja Järvenpää omina kaupunkeinaan.',
  },
  { key: 'hyvinkaa', name: 'Hyvinkää', short: 'Hyvinkää' },
  { key: 'hameenlinna', name: 'Hämeenlinna', short: 'Hämeenlinna' },
  { key: 'jyvaskyla', name: 'Jyväskylä', short: 'Jyväskylä', account: '@miitit_jyvaskyla' },
  { key: 'kouvola', name: 'Kouvola', short: 'Kouvola' },
  { key: 'kuopio', name: 'Kuopio', short: 'Kuopio', account: '@kuopiothreadsmiitit' },
  { key: 'lahti', name: 'Lahti', short: 'Lahti' },
  {
    key: 'lappeenranta',
    name: 'Lappeenranta',
    short: 'Lappeenranta',
    account: '@miitit.lappeenranta',
  },
  { key: 'mikkeli', name: 'Mikkeli', short: 'Mikkeli' },
  { key: 'oulu', name: 'Oulu', short: 'Oulu', account: '@miitit_oulu' },
  { key: 'pori', name: 'Pori', short: 'Pori', account: '@miititpori26' },
  { key: 'porvoo', name: 'Porvoo', short: 'Porvoo' },
  { key: 'riihimaki', name: 'Riihimäki', short: 'Riihimäki' },
  { key: 'tampere', name: 'Tampere', short: 'Tampere', account: '@tamperesinkut' },
  { key: 'turku', name: 'Turku', short: 'Turku' },
];

/** Admin Threads handles. @type {string[]} */
export const ADMINS = ['@tintsh', '@nipatran', '@lupinesse'];

/**
 * @typedef {object} MeetupRecord
 * @property {string} date - ISO date string (YYYY-MM-DD).
 * @property {string} city - City key matching a CityRecord.
 * @property {string} title - Display name of the meetup.
 * @property {string} cat - Category key.
 * @property {string[]} org - Organiser Threads handles.
 * @property {string} url - URL to the Threads post (empty string if none).
 * @property {string} [area] - Optional venue / area detail.
 */

/**
 * Seed meetups. Read-only — user events are managed separately by EventStore.
 * @type {MeetupRecord[]}
 */
export const MEETUPS = [
  // HELSINKI & PK-SEUTU
  {
    date: '2026-03-28',
    city: 'helsinki',
    title: 'Liikuntamiitti',
    cat: 'liikunta',
    org: ['@yoschu86'],
    url: 'https://www.threads.com/@yoschu86/post/DWL8CpzAtQL',
  },
  {
    date: '2026-03-30',
    city: 'helsinki',
    title: 'Karaokebingo: KASARI',
    cat: 'karaoke',
    org: ['@lupinesse'],
    url: 'https://www.threads.com/@lupinesse/post/DVD--bfiNza',
  },
  {
    date: '2026-04-03',
    city: 'helsinki',
    title: 'Kulttuuria & skumppaa',
    cat: 'kulttuuri',
    org: ['@sinizaez'],
    url: 'https://www.threads.com/@sinizaez/post/DVVx7LvjJ6H',
  },
  {
    date: '2026-04-11',
    city: 'helsinki',
    title: 'Lautapelimiitti',
    cat: 'pelit',
    org: ['@ennasfrequency'],
    url: 'https://www.threads.com/@ennakuloista/post/DTBGudMiKt3',
  },
  {
    date: '2026-04-13',
    city: 'helsinki',
    title: 'Marjan synttärimiitti',
    cat: 'illanvietto',
    org: ['@marja_hattara'],
    url: 'https://www.threads.com/@marja_hattara/post/DV0NRLcCCEY',
  },
  {
    date: '2026-04-17',
    city: 'helsinki',
    title: 'Ulina-afterit',
    cat: 'illanvietto',
    org: ['@lupinesse'],
    url: 'https://www.threads.com/@lupinesse/post/DWWBe0rCDkH',
  },
  {
    date: '2026-04-17',
    city: 'helsinki',
    title: 'Kaada tuoppiin sitä punkkua',
    cat: 'ruokajuoma',
    org: ['@tiinamrjn', '@sannushki'],
    url: 'https://www.threads.com/@tiinamrjn/post/DSAq6LoCMjt',
  },
  {
    date: '2026-04-20',
    city: 'helsinki',
    title: 'Savusaunamiitti',
    cat: 'sauna',
    org: ['@liukkonen_satu'],
    area: 'Vantaa',
    url: 'https://www.threads.com/@liukkonen_satu/post/DVviNkhiFi-',
  },
  {
    date: '2026-04-24',
    city: 'helsinki',
    title: 'Studio Julmahuvi -maraton',
    cat: 'kulttuuri',
    org: ['@lupinesse'],
    url: 'https://www.threads.com/@lupinesse/post/DVgJzi-CIVO',
  },
  {
    date: '2026-04-26',
    city: 'helsinki',
    title: 'Lauttasaaren ympärikävely',
    cat: 'liikunta',
    org: ['@ennasfrequency'],
    url: 'https://www.threads.com/@ennasfrequency/post/DV_GlGZiBhA',
  },
  {
    date: '2026-05-01',
    city: 'helsinki',
    title: 'Juomalaulumiitti',
    cat: 'karaoke',
    org: ['@minnakene'],
    area: 'Espoo',
    url: 'https://www.threads.com/@minnakene/post/DU5JNHTDcPC',
  },
  {
    date: '2026-05-05',
    city: 'helsinki',
    title: 'Aikuisten afterwork-kerho',
    cat: 'illanvietto',
    org: ['@lupinesse'],
    url: 'https://www.threads.com/@lupinesse/post/DVdZ199iHzU',
  },
  {
    date: '2026-05-09',
    city: 'helsinki',
    title: 'Lautapelimiitti',
    cat: 'pelit',
    org: ['@ennakuloista'],
    url: 'https://www.threads.com/@ennakuloista/post/DTBGudMiKt3',
  },
  {
    date: '2026-05-11',
    city: 'helsinki',
    title: 'Savusaunamiitti vol. 5',
    cat: 'sauna',
    org: ['@sennikaani', '@skatexsalsa'],
    area: 'Vantaa',
    url: 'https://www.threads.com/@sennikaani/post/DVrScQiiEKt',
  },
  {
    date: '2026-05-15',
    city: 'helsinki',
    title: 'Sinkkuristeily',
    cat: 'sinkut',
    org: ['@tarja_1976'],
    url: 'https://www.threads.com/@tarja_1976/post/DVV1AoviBGO',
  },
  // HYVINKÄÄ
  {
    date: '2026-04-04',
    city: 'hyvinkaa',
    title: 'Hyvinkäämiitti',
    cat: 'yleinen',
    org: ['@pathildae', '@helojuhis', '@mandi_saila'],
    url: 'https://www.threads.com/@helojuhis/post/DV_FpR1DQRX',
  },
  // HÄMEENLINNA
  {
    date: '2026-04-17',
    city: 'hameenlinna',
    title: 'Kuukausimiitti',
    cat: 'yleinen',
    org: ['@sannai77'],
    url: 'https://www.threads.com/@sannai77/post/DS-Q9aFCP71',
  },
  {
    date: '2026-04-25',
    city: 'hameenlinna',
    title: 'Tarotpuotimiitti',
    cat: 'kulttuuri',
    org: ['@elinarsku', '@_asiallinen_nimi_'],
    url: 'https://www.threads.com/@elinarsku/post/DUp9XuxDIcE',
  },
  {
    date: '2026-07-25',
    city: 'hameenlinna',
    title: 'Hämeenlinna_miitti 2.0',
    cat: 'yleinen',
    org: ['@_asiallinen_nimi_'],
    url: 'https://www.threads.com/@_asiallinen_nimi_/post/DUxWRKNgLdJ',
  },
  // KUOPIO
  {
    date: '2026-04-07',
    city: 'kuopio',
    title: 'Pullamiitti',
    cat: 'ruokajuoma',
    org: ['@kuopiothreadsmiitit'],
    url: 'https://www.threads.com/@kuopiothreadsmiitit/post/DWRleydE8-q',
  },
  // LAHTI
  {
    date: '2026-05-23',
    city: 'lahti',
    title: 'Kevätgaala',
    cat: 'illanvietto',
    org: ['@hanneaitokari'],
    url: 'https://www.threads.com/@hanneaitokari/post/DRmTeDxDIUi',
  },
  // MIKKELI
  {
    date: '2026-04-25',
    city: 'mikkeli',
    title: 'Itä-Suomen kevätmiitti',
    cat: 'yleinen',
    org: ['@hilgelli', '@kuopiothreadsmiitit'],
    url: 'https://www.threads.com/@hilgelli/post/DVDc2bfDIeb',
  },
  // OULU
  {
    date: '2026-04-09',
    city: 'oulu',
    title: 'Torstaikaraoke goes Oulu',
    cat: 'karaoke',
    org: ['@lupinesse', '@rinnahei'],
    url: 'https://www.threads.com/@rinnahei/post/DVOQ4TgjYhe',
  },
  // PORI
  {
    date: '2026-07-22',
    city: 'pori',
    title: 'Miitti Eetunaukiolla',
    cat: 'yleinen',
    org: ['@miititpori26'],
    url: 'https://www.threads.com/@miititpori26/post/DTDscy2AtVC',
  },
  // PORVOO
  {
    date: '2026-03-27',
    city: 'porvoo',
    title: 'Minigolf-miitti',
    cat: 'pelit',
    org: ['@oca_oca', '@tamsilaine', '@mayaanen'],
    url: 'https://www.threads.com/@kilpikonni/post/DVgHX2miOU4',
  },
  // TAMPERE
  {
    date: '2026-04-02',
    city: 'tampere',
    title: 'Torstaikaraoke goes Tampere',
    cat: 'karaoke',
    org: ['@lupinesse'],
    url: 'https://www.threads.com/@lupinesse/post/DVdONiYCFzI',
  },
  {
    date: '2026-04-02',
    city: 'tampere',
    title: 'Sinkkumiitti',
    cat: 'sinkut',
    org: ['@rossikrisu'],
    url: 'https://www.threads.com/@rossikrisu/post/DVyDEXCjRxe',
  },
  {
    date: '2026-04-03',
    city: 'tampere',
    title: 'Ravintola Puisto -miitti',
    cat: 'ruokajuoma',
    org: ['@davibynature'],
    url: 'https://www.threads.com/@davibynature/post/DV6vSWBDNak',
  },
  {
    date: '2026-04-05',
    city: 'tampere',
    title: 'Nuotiomiitti',
    cat: 'liikunta',
    org: ['@hannemari_'],
    url: 'https://www.threads.com/@hannemari_/post/DV6eYUCjZ60',
  },
  {
    date: '2026-05-13',
    city: 'tampere',
    title: 'Kello viiden tee feat. K40-disko',
    cat: 'illanvietto',
    org: ['@pirkkalanmafioso'],
    url: 'https://www.threads.com/@pirkkalanmafioso/post/DT3VvqICKqt',
  },
  {
    date: '2026-07-04',
    city: 'tampere',
    title: 'Nillitysmiitti',
    cat: 'yleinen',
    org: ['@eskelisenhanna'],
    url: 'https://www.threads.com/@eskelisenhanna/post/DSpu3f2AszR',
  },
  // TURKU
  {
    date: '2026-03-28',
    city: 'turku',
    title: 'Pizzaa, drinkkejä ja siihen viekö -miitti',
    cat: 'ruokajuoma',
    org: ['@oskarinotsowild'],
    url: 'https://www.threads.com/@oskarinotsowild/post/DVLarrECMla',
  },
  {
    date: '2026-07-17',
    city: 'turku',
    title: 'Nupit kaakkoon',
    cat: 'yleinen',
    org: ['@itsmedzii'],
    url: '',
  },
  {
    date: '2026-07-28',
    city: 'turku',
    title: 'Kesäretki Seiliin',
    cat: 'yleinen',
    org: ['@ilonapai', '@lupinesse'],
    url: '',
  },
  // HELSINKI & PK-SEUTU — kesä–elokuu 2026
  {
    date: '2026-06-19',
    city: 'helsinki',
    title: 'Sinkkujen juhannusjuhla',
    cat: 'sinkut',
    org: ['@tarja_1976'],
    url: '',
  },
  {
    date: '2026-06-19',
    city: 'helsinki',
    title: 'Konepajan juhannustanssit',
    cat: 'illanvietto',
    org: ['@hennakarppinenkummunmaki'],
    url: '',
  },
  {
    date: '2026-06-24',
    city: 'helsinki',
    title: 'Kruunuvuorenrannan auringonlaskumiitti',
    cat: 'illanvietto',
    org: ['@saarelman_jussi', '@sofiatertta'],
    url: '',
  },
  {
    date: '2026-06-26',
    city: 'helsinki',
    title: 'Mummotunnelimiitti',
    cat: 'illanvietto',
    org: ['@marjuttimou', '@pathildae'],
    url: '',
  },
  {
    date: '2026-06-26',
    city: 'helsinki',
    title: 'Gambinakokous',
    cat: 'ruokajuoma',
    org: ['@biledanin_faija'],
    url: '',
  },
  {
    date: '2026-06-28',
    city: 'helsinki',
    title: 'CMX-nuotiolaulumiitti',
    cat: 'karaoke',
    org: ['@anttisieppi', '@mathmuse_314'],
    area: 'Vantaa',
    url: '',
  },
  {
    date: '2026-06-28',
    city: 'helsinki',
    title: 'Elokuvamiitti: Minä, Simon',
    cat: 'kulttuuri',
    org: ['@heta.kamarainen'],
    url: '',
  },
  {
    date: '2026-07-02',
    city: 'helsinki',
    title: 'Sinkkujen Mummotunneli-miitti',
    cat: 'sinkut',
    org: ['@hilgelli'],
    url: '',
  },
  {
    date: '2026-07-08',
    city: 'helsinki',
    title: 'Hörhö- ja mytologiamiitti',
    cat: 'kulttuuri',
    org: ['@sannarrrrrr'],
    url: '',
  },
  {
    date: '2026-07-17',
    city: 'helsinki',
    title: 'Elokuvamiitti: The Odyssey',
    cat: 'kulttuuri',
    org: ['@heta.kamarainen'],
    url: '',
  },
  {
    date: '2026-07-17',
    city: 'helsinki',
    title: 'Bileristeilymiitti',
    cat: 'illanvietto',
    org: ['@marja_hattara', '@roosa_ihalainen', '@marjuttimou'],
    url: '',
  },
  {
    date: '2026-07-22',
    city: 'helsinki',
    title: 'Photowalk',
    cat: 'liikunta',
    org: ['@punapipomies', '@anttisieppi'],
    url: '',
  },
  {
    date: '2026-07-26',
    city: 'helsinki',
    title: 'Tanssimiitti',
    cat: 'liikunta',
    org: ['@marjuttimou', '@tamsilaine'],
    url: '',
  },
  {
    date: '2026-08-29',
    city: 'helsinki',
    title: 'Elokuvamiitti',
    cat: 'kulttuuri',
    org: ['@heta.kamarainen'],
    area: 'Espoo',
    url: '',
  },
  // HYVINKÄÄ
  {
    date: '2026-08-01',
    city: 'hyvinkaa',
    title: 'Velapiknik',
    cat: 'ruokajuoma',
    org: ['@iippakoo'],
    url: '',
  },
  // KOUVOLA
  {
    date: '2026-07-04',
    city: 'kouvola',
    title: 'Saunamiitti',
    cat: 'sauna',
    org: ['@emssofia', '@tiina_1983', '@mattirantonen'],
    url: '',
  },
  // KUOPIO
  {
    date: '2026-06-23',
    city: 'kuopio',
    title: 'Piknikmiitti',
    cat: 'ruokajuoma',
    org: ['@kuopiothreadsmiitit'],
    url: '',
  },
  {
    date: '2026-07-01',
    city: 'kuopio',
    title: 'Piknikmiitti',
    cat: 'ruokajuoma',
    org: ['@kuopiothreadsmiitit'],
    url: '',
  },
  // LAPPEENRANTA
  {
    date: '2026-06-19',
    city: 'lappeenranta',
    title: 'Juhannuspiknik',
    cat: 'ruokajuoma',
    org: ['@sauroska', '@janerva_s'],
    url: '',
  },
  {
    date: '2026-08-01',
    city: 'lappeenranta',
    title: 'Lappuhaalarimiitti',
    cat: 'illanvietto',
    org: ['@jessicakuu', '@ereponen'],
    url: '',
  },
  // PORI
  {
    date: '2026-07-19',
    city: 'pori',
    title: 'Sammakkoleivosmiitti',
    cat: 'ruokajuoma',
    org: ['@riikkahelenap'],
    url: '',
  },
  // PORVOO
  {
    date: '2026-06-18',
    city: 'porvoo',
    title: 'Porvoon picnicmiitti',
    cat: 'ruokajuoma',
    org: ['@kilpikonni'],
    url: '',
  },
  // RIIHIMÄKI
  {
    date: '2026-07-04',
    city: 'riihimaki',
    title: 'Riihimäki-miitti',
    cat: 'yleinen',
    org: ['@zagranth'],
    url: '',
  },
  // TAMPERE — kesä–elokuu 2026
  {
    date: '2026-06-19',
    city: 'tampere',
    title: 'Iltapukupussikaljat',
    cat: 'illanvietto',
    org: ['@mika.rasa', '@niinajm'],
    url: '',
  },
  {
    date: '2026-07-10',
    city: 'tampere',
    title: 'Sinkkuilta',
    cat: 'sinkut',
    org: ['@rossikrisu'],
    url: '',
  },
  {
    date: '2026-07-18',
    city: 'tampere',
    title: 'Kaljakerhon pussikaljamiitti',
    cat: 'ruokajuoma',
    org: ['@viininrakastaja'],
    url: '',
  },
  {
    date: '2026-07-18',
    city: 'tampere',
    title: 'Piknikmiitti Koskipuistossa',
    cat: 'yleinen',
    org: ['@karpitar', '@lupinesse'],
    url: '',
  },
];

/**
 * Date helper utilities.
 * All methods accept and return ISO date strings (YYYY-MM-DD) unless noted.
 */
export const DH = {
  /**
   * Parses an ISO date string into a local Date object (avoids UTC offset).
   * @param {string} iso - Date in YYYY-MM-DD format.
   * @returns {Date}
   */
  parse(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  },

  /** @returns {Date} Today's local date (time zeroed). */
  today() {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  },

  /** @returns {string} Today as YYYY-MM-DD. */
  todayStr() {
    const n = new Date();
    const y = n.getFullYear();
    const m = String(n.getMonth() + 1).padStart(2, '0');
    const d = String(n.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  /**
   * Number of whole days from ISO date `a` to ISO date `b` (positive = future).
   * @param {string} a
   * @param {string} b
   * @returns {number}
   */
  daysBetween(a, b) {
    return Math.round((this.parse(b) - this.parse(a)) / 86400000);
  },

  /**
   * Finnish weekday abbreviation for an ISO date.
   * @param {string} iso
   * @returns {string} e.g. 'MA', 'TI', 'KE'
   */
  weekdayFi(iso) {
    return ['SU', 'MA', 'TI', 'KE', 'TO', 'PE', 'LA'][this.parse(iso).getDay()];
  },

  /**
   * Short Finnish date, e.g. "28.3."
   * @param {string} iso
   * @returns {string}
   */
  fmtShort(iso) {
    const d = this.parse(iso);
    return `${d.getDate()}.${d.getMonth() + 1}.`;
  },

  /**
   * Long Finnish date, e.g. "lauantai 28. maaliskuuta"
   * @param {string} iso
   * @returns {string}
   */
  fmtLong(iso) {
    const d = this.parse(iso);
    const wd = [
      'sunnuntai',
      'maanantai',
      'tiistai',
      'keskiviikko',
      'torstai',
      'perjantai',
      'lauantai',
    ][d.getDay()];
    const monGen = [
      'tammikuuta',
      'helmikuuta',
      'maaliskuuta',
      'huhtikuuta',
      'toukokuuta',
      'kesäkuuta',
      'heinäkuuta',
      'elokuuta',
      'syyskuuta',
      'lokakuuta',
      'marraskuuta',
      'joulukuuta',
    ][d.getMonth()];
    return `${wd} ${d.getDate()}. ${monGen}`;
  },

  /**
   * Month group key for sorting/grouping, e.g. "2026-2"
   * @param {string} iso
   * @returns {string}
   */
  monthKey(iso) {
    const d = this.parse(iso);
    return `${d.getFullYear()}-${d.getMonth()}`;
  },

  /**
   * Human-readable Finnish month label, e.g. "maaliskuu 2026"
   * @param {string} iso
   * @returns {string}
   */
  monthLabel(iso) {
    const d = this.parse(iso);
    return `${MONTHS_FI[d.getMonth()]} ${d.getFullYear()}`;
  },

  /**
   * @param {string} iso
   * @returns {boolean} True when the date is today or in the future.
   */
  isUpcoming(iso) {
    return this.daysBetween(this.todayStr(), iso) >= 0;
  },

  /**
   * @param {string} iso
   * @returns {boolean} True when the date is within the next 7 days (inclusive).
   */
  isThisWeek(iso) {
    const n = this.daysBetween(this.todayStr(), iso);
    return n >= 0 && n <= 7;
  },
};
