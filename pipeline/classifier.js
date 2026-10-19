/* ============================================================================
   IG-Analysis classifier — places an unknown account in the taxonomy.
   Heuristics first (free, offline); the backend adds a Claude fallback only
   when confidence is low. Outputs values from the controlled vocabulary
   (see account-directory-taxonomy.xlsx), so results drop straight into the sheet.

   Returns:
     { benchmarkType:'creator'|'brand', type, discipline, category,
       confidence:'High'|'Medium'|'Low', reasons:[...], needsReview:bool }
   ========================================================================== */
(function (root) {
  'use strict';

  // Controlled vocab (must match account-directory-taxonomy.xlsx)
  const DISCIPLINES = ['Surfing','Skateboarding','Snowboarding','Skiing','Bodyboarding','SUP','BMX','MTB','Wakeboarding','Motocross / FMX','Outdoor / Adventure','Multi-sport','Lifestyle / Streetwear'];

  // Discipline keyword map (searched in name + bio + IG category)
  const DISC_KW = {
    'Surfing': ['surf','wave','wsl','barrel','reef break','lineup','swell','boardrider','shaper','wetsuit','boardshort','shortboard','longboard surf'],
    'Skateboarding': ['skate','skateboard','sk8',' deck','trucks','kickflip','thrasher','skatepark'],
    'Snowboarding': ['snowboard','snowboarding','powder','backcountry snow','freeride snow'],
    'Skiing': ['skiing','freeski','ski ','mogul','alpine ski'],
    'Bodyboarding': ['bodyboard','boog'],
    'SUP': ['paddleboard','stand up paddle',' sup '],
    'BMX': ['bmx'],
    'MTB': ['mtb','mountain bike','enduro','downhill mtb'],
    'Wakeboarding': ['wakeboard','wake '],
    'Motocross / FMX': ['motocross','supercross',' fmx','moto '],
    'Outdoor / Adventure': ['hiking','climbing','trail','mountaineer','alpine','outdoor','backpack','camping'],
    'Lifestyle / Streetwear': ['streetwear','fashion','lifestyle brand']
  };

  // Category keyword map
  const CAT_KW = {
    // brand
    'Hardgoods': ['surfboard','snowboard','skis','shapes','shaper','industries','softboard','foamie',' boards','board co'],
    'Wetsuits': ['wetsuit','neoprene'],
    'Apparel': ['apparel','clothing','wear','threads','denim','tees','streetwear','garments'],
    'Accessories': ['fins','leash','traction','trucks','wheels','bindings','grip tape','surf wax'],
    'Footwear': ['footwear','shoes','boots','sneaker'],
    'Eyewear': ['eyewear','sunglasses','optics','goggles'],
    'Headwear & Bags': ['headwear','hats','beanies','bags','packs','luggage'],
    'Tech / Hardware': ['camera','gopro','tech','electronics','audio','wearable','action cam'],
    'Retailer / Stockist': ['surf shop','skate shop','boardstore','stockist','boutique','retailer','online store',' shop','superstore'],
    // media
    'Publication / Editorial': ['magazine',' mag','media','news','journal','editorial','stories'],
    'Film / Video': ['films','productions','cinema','video production','filmmaker'],
    'Photography': ['photography','photographer','photo','visuals','lens'],
    'Podcast': ['podcast'],
    'Broadcast / Streaming': ['tv','streaming','broadcast','channel'],
    // athlete
    'Championship Tour': ['wsl','championship tour',' ct ','qualifying series',' qs ','sls','street league','olympic','olympian','world tour','competitor'],
    'Freesurfer / Free-rider': ['freesurfer','free surfer','freeride'],
    'Big Wave': ['big wave','xxl','nazare','jaws','peahi','maverick'],
    'Junior / Rising': ['junior','grom','u18','under 18','rising','next gen'],
    'Adaptive / Para': ['adaptive','para surf','paralympic'],
    // org
    'League / Tour': ['league','world tour','federation','sanctioning'],
    'Event / Comp': ['open','classic','festival','championships','invitational'],
    'Non-profit / Advocacy': ['foundation','non-profit','nonprofit','charity','surfrider','ocean conservation','advocacy'],
    'Shaper / Craftsperson': ['shaper','craftsman','hand shaped'],
    'Coach / Educator': ['coach','coaching','learn to surf','technique'],
    'Influencer / Lifestyle': ['creator','influencer','content creator','ambassador']
  };

  // IG business-category → benchmark type + hints
  const IGCAT_CREATOR = ['athlete','public figure','digital creator','blogger','artist','musician','personal blog','author','entrepreneur','coach'];
  const IGCAT_BRAND   = ['clothing','sportswear','retail','shopping','product','company','brand','store','sports team','sporting goods','outdoor','media','magazine','publisher','e-commerce'];

  const BRAND_TOKENS = ['surfboards','surfboard','softboards','softboard','wetsuits','industries','official','clothing','apparel','co.','supply','store','shop','eyewear','optics','footwear','skateboards','snowboards','collective','studios','magazine','media','films','productions','foundation','league','federation','association','the ','worldwide','brand'];

  const lc = s => (s || '').toLowerCase();
  const has = (hay, kw) => hay.indexOf(kw) !== -1;
  const looksLikePerson = name => {
    const t = (name || '').trim().split(/\s+/);
    return t.length >= 2 && t.length <= 3 && t.every(w => /^[A-Za-z'.-]+$/.test(w)) &&
      !BRAND_TOKENS.some(b => lc(name).includes(b.trim()));
  };

  function classifyAccount(profile) {
    const name = profile.fullName || '';
    const handle = profile.username || '';
    const bio = profile.biography || '';
    const igcat = lc(profile.businessCategoryName || '');
    const hay = lc(`${name} ${handle} ${bio} ${igcat}`);
    const reasons = [];

    // ── TYPE / benchmark ──────────────────────────────────────────────
    // Two-word brand names ("Rip Curl") look just like people ("Jake Miller"),
    // so bio/category language is the real disambiguator.
    let creatorScore = 0, brandScore = 0;
    const brandBio = /(\bcompany\b|wetsuit|apparel|clothing|footwear|eyewear|since \d{4}|est\.?\s*\d{4}|™|®|our collection|new collection|the ultimate|worldwide|official (store|account)|shop now|free shipping)/.test(lc(bio));
    if (IGCAT_CREATOR.some(c => igcat.includes(c))) { creatorScore += 3; reasons.push(`IG category "${profile.businessCategoryName}"`); }
    if (IGCAT_BRAND.some(c => igcat.includes(c)))   { brandScore += 3; reasons.push(`IG category "${profile.businessCategoryName}"`); }
    if (BRAND_TOKENS.some(b => lc(handle).includes(b.trim()) || lc(name).includes(b.trim()))) { brandScore += 2; reasons.push('brand-style name/handle'); }
    if (brandBio) { brandScore += 3; reasons.push('brand language in bio'); }
    if (looksLikePerson(name) && !brandBio) { creatorScore += 2; reasons.push('name reads as a person'); }
    if (/\b(i|my|me|i'm)\b/.test(lc(bio)) && !brandBio) creatorScore += 1;
    // followers >> following on a person often = creator; brands vary. Weak signal only.
    const benchmarkType = brandScore > creatorScore ? 'brand' : 'creator';
    const typeMargin = Math.abs(brandScore - creatorScore);
    const type = benchmarkType === 'brand'
      ? (/(league|federation|world surf league|governing|non-profit|nonprofit|charity|foundation)/.test(hay) ? 'Org / Event'
        : /(magazine|media|news|films|productions|photographer|podcast)/.test(hay) ? 'Media'
        : /(surf shop|skate shop|board ?store|stockist|retailer|boutique|online store|superstore)/.test(hay) ? 'Retailer'
        : 'Brand')
      : (/(athlete|wsl|championship tour|competitor|world champion|olympian|pro surfer|pro skater|pro snowboarder|freesurfer)/.test(hay) ? 'Athlete' : 'Creator');

    // ── DISCIPLINE ────────────────────────────────────────────────────
    const discHits = DISCIPLINES.filter(d => (DISC_KW[d] || []).some(kw => has(hay, kw)));
    let discipline = discHits[0] || '';
    if (discHits.length >= 3) discipline = 'Multi-sport';
    if (!discipline && /(redbull|monster|gopro|oakley|vans)/.test(hay)) discipline = 'Multi-sport';

    // ── CATEGORY ──────────────────────────────────────────────────────
    let category = '';
    const catHits = Object.keys(CAT_KW).filter(c => CAT_KW[c].some(kw => has(hay, kw)));
    // Prefer a category consistent with the detected Type
    const brandCats = ['Hardgoods','Wetsuits','Apparel','Accessories','Footwear','Eyewear','Headwear & Bags','Tech / Hardware','Retailer / Stockist'];
    const athCats = ['Championship Tour','Freesurfer / Free-rider','Big Wave','Junior / Rising','Adaptive / Para'];
    const mediaCats = ['Publication / Editorial','Film / Video','Photography','Podcast','Broadcast / Streaming'];
    const orgCats = ['League / Tour','Event / Comp','Non-profit / Advocacy','Team / Crew','Governing Body'];
    const pref = type === 'Athlete' ? athCats : type === 'Media' ? mediaCats
      : type === 'Org / Event' ? orgCats
      : (type === 'Brand' || type === 'Retailer') ? brandCats : [];
    category = catHits.find(c => pref.includes(c)) || catHits[0] || '';
    if (type === 'Retailer' && !category) category = 'Retailer / Stockist';
    if (type === 'Org / Event' && !category && /(league|tour|federation)/.test(hay)) category = 'League / Tour';

    // ── CONFIDENCE ────────────────────────────────────────────────────
    const typeConf = (IGCAT_CREATOR.concat(IGCAT_BRAND).some(c => igcat.includes(c)) || typeMargin >= 2) ? 'High' : typeMargin === 1 ? 'Medium' : 'Low';
    let confidence = typeConf;
    if (!discipline || !category) confidence = confidence === 'High' ? 'Medium' : 'Low';
    const needsReview = confidence !== 'High' || !discipline || !category;

    return { benchmarkType, type, discipline, category, confidence, needsReview,
      reasons: [...new Set(reasons)] };
  }

  const API = { classifyAccount, DISCIPLINES, CAT_KW };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.IGClassifier = API;
})(typeof window !== 'undefined' ? window : globalThis);
