#!/usr/bin/env python3
"""
Fetches Apify post scraper data + profile scraper data,
aggregates per brand, and loads into Supabase.

Usage:
  python3 load_supabase.py YOUR_APIFY_TOKEN

Datasets:
  Post data  : ZCxkB2kUW1b4URvlS  (3,855 posts from 235 brands)
  Profile data: On4aMufHSZNVI6FrJ  (287 profiles — followers, etc.)
"""

import sys, json, urllib.request, urllib.parse, time
from collections import defaultdict

# ── CONFIG ────────────────────────────────────────────────────
APIFY_TOKEN     = sys.argv[1] if len(sys.argv) > 1 else ""
SERVICE_KEY     = sys.argv[2] if len(sys.argv) > 2 else ""   # Supabase service_role key (bypasses RLS)
POST_DATASET    = "ZCxkB2kUW1b4URvlS"
PROFILE_DATASET = "On4aMufHSZNVI6FrJ"
SUPABASE_URL    = "https://jvkiscmfpsoyudqbuvke.supabase.co"
SUPABASE_KEY    = SERVICE_KEY if SERVICE_KEY else "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2a2lzY21mcHNveXVkcWJ1dmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxODI5MjQsImV4cCI6MjA5NTc1ODkyNH0._BkmEVZL0zX8FyvX-KsOBOV4W2FdgqnGzb9bWRVQ6C0"
PERIOD_END      = "2026-05-31"

# ── BRAND DEFINITIONS ─────────────────────────────────────────
# handle (no @) → { name, category, color, initials, tag }
BRANDS = {
  # Surfboards
  "firewiresurfboards":     {"name":"Firewire Surfboards","category":"surfboards","color":"#E63946","initials":"FW","tag":"Performance"},
  "lostsurfboards":         {"name":"...Lost",             "category":"surfboards","color":"#C05621","initials":"LO","tag":"Performance"},
  "albumsurf":              {"name":"Album Surf",          "category":"surfboards","color":"#6D6875","initials":"AL","tag":"Boutique"},
  "cisurfboards":           {"name":"Channel Islands",     "category":"surfboards","color":"#2B6CB0","initials":"CI","tag":"Performance"},
  "chilli_surfboards":      {"name":"Chilli Surfboards",   "category":"surfboards","color":"#D00000","initials":"CH","tag":"Performance"},
  "rustysurfboards":        {"name":"Rusty Surfboards",    "category":"surfboards","color":"#F4A261","initials":"RS","tag":"Performance"},
  "dhdsurf":                {"name":"DHD Surfboards",      "category":"surfboards","color":"#C53030","initials":"DH","tag":"Performance"},
  "haydenshapes":           {"name":"HaydenShapes",        "category":"surfboards","color":"#457B9D","initials":"HS","tag":"Performance"},
  "jsindustries99":         {"name":"JS Industries",       "category":"surfboards","color":"#276749","initials":"JS","tag":"Performance"},
  "pyzelsurfboards":        {"name":"Pyzel Surfboards",    "category":"surfboards","color":"#3A86FF","initials":"PY","tag":"Performance"},
  "slaterdesigns":          {"name":"Slater Designs",      "category":"surfboards","color":"#264653","initials":"SD","tag":"Premium"},
  "sharpeyesurfboards":     {"name":"SharpEye Surfboards", "category":"surfboards","color":"#7209B7","initials":"SE","tag":"Performance"},
  "christensonsurfboards":  {"name":"Christenson",         "category":"surfboards","color":"#6B4FBB","initials":"CR","tag":"Boutique"},
  "systm.101":              {"name":"System 101",          "category":"surfboards","color":"#0D1B2A","initials":"S1","tag":"Boutique"},
  "draftsurf":              {"name":"DRAFT",               "category":"surfboards","color":"#415A77","initials":"DR","tag":"Boutique"},
  "arakawasurfboards":      {"name":"Arakawa",             "category":"surfboards","color":"#8B5E3C","initials":"AR","tag":"Boutique"},
  "thunderboltsurfboards":  {"name":"Tolhurst",            "category":"surfboards","color":"#5C4033","initials":"TL","tag":"Boutique"},
  "simonanderson_surfboards":{"name":"Simon Anderson",     "category":"surfboards","color":"#2D6A4F","initials":"SA","tag":"Heritage"},
  "mctavishsurf":           {"name":"McTavish",            "category":"surfboards","color":"#9B2226","initials":"MC","tag":"Heritage"},
  "aipasurf":               {"name":"AIPA",                "category":"surfboards","color":"#005F73","initials":"AI","tag":"Heritage"},
  "dylanshapes":            {"name":"DYLAN",               "category":"surfboards","color":"#0077B6","initials":"DY","tag":"Boutique"},
  "catchsurf":              {"name":"Catch Surf",          "category":"surfboards","color":"#FF6B35","initials":"CS","tag":"Softboard"},
  "mfsoftboards":           {"name":"MF Softboards",       "category":"surfboards","color":"#F77F00","initials":"MF","tag":"Softboard"},
  "softech_softboards":     {"name":"Softech",             "category":"surfboards","color":"#FCBF49","initials":"ST","tag":"Softboard"},
  "smthshapes":             {"name":"SMTH",                "category":"surfboards","color":"#1D3557","initials":"SM","tag":"Boutique"},
  "cabiancadesign":         {"name":"Cabianca",            "category":"surfboards","color":"#A8201A","initials":"CB","tag":"Performance"},
  "stretchboards":          {"name":"Stretch",             "category":"surfboards","color":"#6A4C93","initials":"ST","tag":"Heritage"},
  "thomassurfboards":       {"name":"THOMAS",              "category":"surfboards","color":"#1B4332","initials":"TH","tag":"Boutique"},
  "sparrowshapes":          {"name":"Sparrow",             "category":"surfboards","color":"#4A4E69","initials":"SP","tag":"Boutique"},
  "lsd_ooo":                {"name":"LSD",                 "category":"surfboards","color":"#6B6570","initials":"LS","tag":"Boutique"},
  "markrichardssurfboards": {"name":"Mark Richards",       "category":"surfboards","color":"#B5838D","initials":"MR","tag":"Heritage"},
  "tpattersonsurfboards":   {"name":"Timmy Patterson",     "category":"surfboards","color":"#E9C46A","initials":"TP","tag":"Performance"},
  # Surf/Surfing
  "astrodeck":              {"name":"Astro Deck",          "category":"surf","color":"#E63946","initials":"AD","tag":"Traction"},
  "billabong":              {"name":"Billabong",           "category":"surf","color":"#F9A825","initials":"BI","tag":"Heritage"},
  "brixton":                {"name":"Brixton",             "category":"surf","color":"#2D3142","initials":"BR","tag":"Lifestyle"},
  "brothers_marshall":      {"name":"Brothers Marshall",   "category":"surf","color":"#6B4FBB","initials":"BM","tag":"Boutique"},
  "creaturesofleisure":     {"name":"Creatures",           "category":"surf","color":"#2B6CB0","initials":"CR","tag":"Accessories"},
  "dakine_surf":            {"name":"Da Kine",             "category":"surf","color":"#276749","initials":"DK","tag":"Accessories"},
  "dragonalliance":         {"name":"Dragon",              "category":"surf","color":"#C53030","initials":"DR","tag":"Eyewear"},
  "fcs_surf":               {"name":"FCS",                 "category":"surf","color":"#1A1A2E","initials":"FC","tag":"Fins"},
  "former":                 {"name":"FORMER",              "category":"surf","color":"#4A4E69","initials":"FO","tag":"Apparel"},
  "hurley":                 {"name":"Hurley",              "category":"surf","color":"#E53935","initials":"HU","tag":"Heritage"},
  "nixon":                  {"name":"Nixon",               "category":"surf","color":"#263238","initials":"NX","tag":"Watches"},
  "oneillusa":              {"name":"O'Neill",             "category":"surf","color":"#00695C","initials":"ON","tag":"Heritage"},
  "outerknown":             {"name":"Outerknown",          "category":"surf","color":"#2D6A4F","initials":"OK","tag":"Sustainable"},
  "quiksilver":             {"name":"Quiksilver",          "category":"surf","color":"#1565C0","initials":"QS","tag":"Heritage"},
  "reef":                   {"name":"Reef",                "category":"surf","color":"#0D47A1","initials":"RF","tag":"Footwear"},
  "rhythm":                 {"name":"Rhythm",              "category":"surf","color":"#6B4FBB","initials":"RY","tag":"Apparel"},
  "ripcurl":                {"name":"Rip Curl",            "category":"surf","color":"#D32F2F","initials":"RC","tag":"Performance"},
  "roark":                  {"name":"Roark",               "category":"surf","color":"#5D4037","initials":"RO","tag":"Adventure"},
  "roxy":                   {"name":"Roxy",                "category":"surf","color":"#E91E8C","initials":"RX","tag":"Heritage"},
  "rvca":                   {"name":"RVCA",                "category":"surf","color":"#4A148C","initials":"RV","tag":"Arts"},
  "salty_crew":             {"name":"Salty Crew",          "category":"surf","color":"#2B6CB0","initials":"SC","tag":"Fishing"},
  "slowtide":               {"name":"Slow Tide",           "category":"surf","color":"#4A7C59","initials":"SL","tag":"Towels"},
  "tcss":                   {"name":"TCSS",                "category":"surf","color":"#1A1A2E","initials":"TC","tag":"Apparel"},
  "themadhueys":            {"name":"The Mad Hueys",       "category":"surf","color":"#E63946","initials":"MH","tag":"Lifestyle"},
  "visslasurf":             {"name":"Vissla",              "category":"surf","color":"#2B6CB0","initials":"VI","tag":"Sustainable"},
  "volcom":                 {"name":"Volcom",              "category":"surf","color":"#1B1B1B","initials":"VO","tag":"Lifestyle"},
  "rivvia.projects":        {"name":"Rivvia",              "category":"surf","color":"#6B4FBB","initials":"RI","tag":"Boutique"},
  "steko22_":               {"name":"STEKO",               "category":"surf","color":"#0D1B2A","initials":"SK","tag":"Boutique"},
  "patagonia_surf":         {"name":"Patagonia Surf",      "category":"surf","color":"#4CAF50","initials":"PT","tag":"Sustainable"},
  "oakleysurfing":          {"name":"Oakley Surf",         "category":"surf","color":"#212121","initials":"OK","tag":"Eyewear"},
  "stanceofficial":         {"name":"Stance",              "category":"surf","color":"#37474F","initials":"SN","tag":"Socks"},
  "skullcandy":             {"name":"Skullcandy",          "category":"surf","color":"#6D6570","initials":"SK","tag":"Audio"},
  "redbullsurfing":         {"name":"Red Bull Surf",       "category":"surf","color":"#D32F2F","initials":"RB","tag":"Energy"},
  "stab":                   {"name":"Stab",                "category":"surf","color":"#1A1A2E","initials":"SB","tag":"Media"},
  "beach.grit":             {"name":"Beach Grit",          "category":"surf","color":"#C05621","initials":"BG","tag":"Media"},
  "surfline":               {"name":"Surfline",            "category":"surf","color":"#0077B6","initials":"SL","tag":"Media"},
  "inherentbummer":         {"name":"Inherent Bummer",     "category":"surf","color":"#6B4FBB","initials":"IB","tag":"Media"},
  "swellnet":               {"name":"Swellnet",            "category":"surf","color":"#2B6CB0","initials":"SW","tag":"Media"},
  "theinertia":             {"name":"The Inertia",         "category":"surf","color":"#1A1A2E","initials":"TI","tag":"Media"},
  "pilgrimsurfsupply":      {"name":"Pilgrim Surf + Supply","category":"surf","color":"#5D4037","initials":"PS","tag":"Retail"},
  # Skate
  "thrashermag":            {"name":"Thrasher",            "category":"skate","color":"#D32F2F","initials":"TH","tag":"Media"},
  "nikesb":                 {"name":"Nike SB",             "category":"skate","color":"#111111","initials":"NS","tag":"Footwear"},
  "vansskate":              {"name":"Vans Skate",          "category":"skate","color":"#CC3333","initials":"VS","tag":"Footwear"},
  "dc_skateboarding":       {"name":"DC Skate",            "category":"skate","color":"#1A1A2E","initials":"DC","tag":"Footwear"},
  "berrics":                {"name":"Berrics",             "category":"skate","color":"#2D3142","initials":"BE","tag":"Media"},
  "hufworldwide":           {"name":"HUF",                 "category":"skate","color":"#4A4E69","initials":"HF","tag":"Lifestyle"},
  "etnies":                 {"name":"etnies",              "category":"skate","color":"#3D2C8D","initials":"ET","tag":"Footwear"},
  "volcomskate":            {"name":"Volcom Skate",        "category":"skate","color":"#1B1B1B","initials":"VK","tag":"Lifestyle"},
  "sls":                    {"name":"Street League",       "category":"skate","color":"#E53935","initials":"SL","tag":"Competition"},
  "spitfirewheels":         {"name":"Spitfire Wheels",     "category":"skate","color":"#FF6D00","initials":"SF","tag":"Hardware"},
  "thundertrucks":          {"name":"Thunder Trucks",      "category":"skate","color":"#424242","initials":"TT","tag":"Hardware"},
  "primitiveskate":         {"name":"Primitive",           "category":"skate","color":"#6A1B9A","initials":"PR","tag":"Street"},
  "santacruzskateboards":   {"name":"Santa Cruz",          "category":"skate","color":"#FF5722","initials":"SC","tag":"Legacy"},
  "realskateboards":        {"name":"REAL",                "category":"skate","color":"#212121","initials":"RL","tag":"Street"},
  "deathwishskateboards":   {"name":"Deathwish",           "category":"skate","color":"#B71C1C","initials":"DW","tag":"Street"},
  "girlskateboards":        {"name":"GIRL",                "category":"skate","color":"#E91E8C","initials":"GR","tag":"Street"},
  "transworldskate":        {"name":"Transworld Skate",    "category":"skate","color":"#1565C0","initials":"TW","tag":"Media"},
  "boneswheels":            {"name":"Bones Wheels",        "category":"skate","color":"#37474F","initials":"BW","tag":"Hardware"},
  "toymachine":             {"name":"Toy Machine",         "category":"skate","color":"#F57F17","initials":"TM","tag":"Street"},
  "krooked":                {"name":"Krooked",             "category":"skate","color":"#4527A0","initials":"KR","tag":"Street"},
  "converse_cons":          {"name":"Converse Cons",       "category":"skate","color":"#1A1A2E","initials":"CC","tag":"Footwear"},
  "zeroskateboards":        {"name":"Zero Skateboards",    "category":"skate","color":"#263238","initials":"ZR","tag":"Street"},
  "nbnumeric":              {"name":"NB Numeric",          "category":"skate","color":"#5D4037","initials":"NB","tag":"Footwear"},
  "redbullskate":           {"name":"RedBull Skate",       "category":"skate","color":"#D32F2F","initials":"RB","tag":"Energy"},
  # Snow
  "burton":                 {"name":"Burton",              "category":"snow","color":"#1A237E","initials":"BU","tag":"Premium"},
  "tetongravity":           {"name":"Teton Gravity",       "category":"snow","color":"#1565C0","initials":"TG","tag":"Film"},
  "unionbindingco":         {"name":"Union Bindings",      "category":"snow","color":"#263238","initials":"UB","tag":"Hardware"},
  "salomonsnowboards":      {"name":"Salomon Snowboards",  "category":"snow","color":"#00695C","initials":"SN","tag":"Performance"},
  "vanssnow":               {"name":"Vans Snow",           "category":"snow","color":"#CC3333","initials":"VS","tag":"Lifestyle"},
  "redbullsnow":            {"name":"Red Bull Snow",       "category":"snow","color":"#D32F2F","initials":"RB","tag":"Energy"},
  "686":                    {"name":"686 Snow",            "category":"snow","color":"#37474F","initials":"68","tag":"Outerwear"},
  "volcomsnow":             {"name":"Volcom Snow",         "category":"snow","color":"#1B1B1B","initials":"VN","tag":"Outerwear"},
  "anonoptics":             {"name":"Anon Optics",         "category":"snow","color":"#4A4E69","initials":"AN","tag":"Eyewear"},
  "snowboardmag":           {"name":"Snowboard Mag",       "category":"snow","color":"#2D3142","initials":"SM","tag":"Media"},
  "methodmag":              {"name":"Method Mag",          "category":"snow","color":"#6B4FBB","initials":"MM","tag":"Media"},
  "libtechnologies":        {"name":"Lib Tech",            "category":"snow","color":"#6D4C41","initials":"LT","tag":"Eco"},
  "ridesnowboards":         {"name":"Ride Snowboards",     "category":"snow","color":"#546E7A","initials":"RD","tag":"Performance"},
  "thirtytwo":              {"name":"ThirtyTwo",           "category":"snow","color":"#5D4037","initials":"32","tag":"Boots"},
  "snowboardermag":         {"name":"Snowboarder Mag",     "category":"snow","color":"#37474F","initials":"SB","tag":"Media"},
  "jonessnowboards":        {"name":"Jones Snowboards",    "category":"snow","color":"#263238","initials":"JN","tag":"Backcountry"},
  "capitasupercorp":        {"name":"CAPiTA",              "category":"snow","color":"#E53935","initials":"CA","tag":"Premium"},
  "whitespace_____":        {"name":"Whitespace",          "category":"snow","color":"#90A4AE","initials":"WS","tag":"Premium"},
  "romesnowboards":         {"name":"Rome Snowboards",     "category":"snow","color":"#4A148C","initials":"RM","tag":"Performance"},
  "yes_snowboards":         {"name":"YES Snowboards",      "category":"snow","color":"#F57F17","initials":"YS","tag":"Performance"},
  "nideckersnowboards":     {"name":"Nidecker",            "category":"snow","color":"#1A1A2E","initials":"ND","tag":"Swiss"},
  "bataleonsnowboards":     {"name":"Bataleon",            "category":"snow","color":"#3F51B5","initials":"BT","tag":"Performance"},
  "forum_snow":             {"name":"Forum Snow",          "category":"snow","color":"#5C6BC0","initials":"FM","tag":"Legacy"},
  "deeluxeboots":           {"name":"Deeluxe",             "category":"snow","color":"#795548","initials":"DL","tag":"Boots"},
  "yukithreads":            {"name":"Yuki Threads",        "category":"snow","color":"#4A4E69","initials":"YT","tag":"Outerwear"},
  # Outdoor
  "thenorthface":           {"name":"The North Face",      "category":"outdoor","color":"#E53935","initials":"NF","tag":"Heritage"},
  "patagonia":              {"name":"Patagonia",           "category":"outdoor","color":"#4CAF50","initials":"PA","tag":"Sustainability"},
  "on":                     {"name":"On Running",          "category":"outdoor","color":"#212121","initials":"ON","tag":"Performance"},
  "arcteryx":               {"name":"Arc'teryx",           "category":"outdoor","color":"#1A1A2E","initials":"AR","tag":"Technical"},
  "hoka":                   {"name":"HOKA",                "category":"outdoor","color":"#FF6D00","initials":"HO","tag":"Running"},
  "rei":                    {"name":"REI",                 "category":"outdoor","color":"#2E7D32","initials":"RI","tag":"Retail"},
  "salomon":                {"name":"Salomon",             "category":"outdoor","color":"#00695C","initials":"SL","tag":"Performance"},
  "yeti":                   {"name":"YETI",                "category":"outdoor","color":"#1565C0","initials":"YT","tag":"Gear"},
  "fjallravenofficial":     {"name":"Fjällräven",          "category":"outdoor","color":"#5D4037","initials":"FJ","tag":"Heritage"},
  "merrell":                {"name":"Merrell",             "category":"outdoor","color":"#795548","initials":"ME","tag":"Footwear"},
  "hellyhansen":            {"name":"Helly Hansen",        "category":"outdoor","color":"#1565C0","initials":"HH","tag":"Marine"},
  "blackdiamond":           {"name":"Black Diamond",       "category":"outdoor","color":"#546E7A","initials":"BD","tag":"Climbing"},
  "cotopaxi":               {"name":"Cotopaxi",            "category":"outdoor","color":"#FF7043","initials":"CO","tag":"Colorful"},
  "lasportivagram":         {"name":"La Sportiva",         "category":"outdoor","color":"#D32F2F","initials":"LS","tag":"Climbing"},
  "peakperformance":        {"name":"Peak Performance",    "category":"outdoor","color":"#37474F","initials":"PP","tag":"Performance"},
  "columbia1938":           {"name":"Columbia",            "category":"outdoor","color":"#1565C0","initials":"CL","tag":"Heritage"},
  "ospreypacks":            {"name":"Osprey",              "category":"outdoor","color":"#2E7D32","initials":"OS","tag":"Packs"},
  "mammut":                 {"name":"Mammut",              "category":"outdoor","color":"#263238","initials":"MM","tag":"Alpine"},
  "marmot":                 {"name":"Marmot",              "category":"outdoor","color":"#E65100","initials":"MT","tag":"Heritage"},
  "smartwool":              {"name":"Smartwool",           "category":"outdoor","color":"#8D6E63","initials":"SW","tag":"Wool"},
  "altrarunning":           {"name":"Altra Running",       "category":"outdoor","color":"#FF6D00","initials":"AL","tag":"Running"},
  "icebreakernz":           {"name":"Icebreaker",          "category":"outdoor","color":"#37474F","initials":"IB","tag":"Merino"},
  "mountainhardwear":       {"name":"Mountain Hardwear",   "category":"outdoor","color":"#4A4E69","initials":"MH","tag":"Alpine"},
  "outdoorresearch":        {"name":"Outdoor Research",    "category":"outdoor","color":"#33691E","initials":"OR","tag":"Technical"},
  "rab.equipment":          {"name":"Rab",                 "category":"outdoor","color":"#1A1A2E","initials":"RB","tag":"Alpine"},
  "gregorypacks":           {"name":"Gregory Packs",       "category":"outdoor","color":"#5D4037","initials":"GP","tag":"Packs"},
  "kuhl":                   {"name":"KÜHL",                "category":"outdoor","color":"#6D4C41","initials":"KL","tag":"Lifestyle"},
  "klattermusen":           {"name":"Klättermusen",        "category":"outdoor","color":"#37474F","initials":"KM","tag":"Scandinavian"},
  "haglofs":                {"name":"Haglöfs",             "category":"outdoor","color":"#2E7D32","initials":"HG","tag":"Scandinavian"},
  "houdinisportswear":      {"name":"Houdini",             "category":"outdoor","color":"#0288D1","initials":"HD","tag":"Sustainable"},
  "nemoequipment":          {"name":"Nemo Equipment",      "category":"outdoor","color":"#FF6D00","initials":"NE","tag":"Camping"},
  "snowpeak_official":      {"name":"Snow Peak",           "category":"outdoor","color":"#263238","initials":"SP","tag":"Japanese"},
  "andwander_official":     {"name":"And Wander",          "category":"outdoor","color":"#546E7A","initials":"AW","tag":"Japanese"},
  "nanamica":               {"name":"Nanamica",            "category":"outdoor","color":"#37474F","initials":"NA","tag":"Japanese"},
  "goldwin_global":         {"name":"Goldwin",             "category":"outdoor","color":"#1A1A2E","initials":"GW","tag":"Japanese"},
  "roa_hiking":             {"name":"ROA Hiking",          "category":"outdoor","color":"#6D4C41","initials":"RO","tag":"Hiking"},
  "18eastofficial":         {"name":"18 East",             "category":"outdoor","color":"#4A4E69","initials":"1E","tag":"Workwear"},
  "nanga_official":         {"name":"Nanga",               "category":"outdoor","color":"#1565C0","initials":"NG","tag":"Down"},
  "ostryaequipment":        {"name":"Ostrya",              "category":"outdoor","color":"#37474F","initials":"OT","tag":"Technical"},
  "hikingpatrol":           {"name":"Hiking Patrol",       "category":"outdoor","color":"#5D4037","initials":"HP","tag":"Community"},
  "manresamfg":             {"name":"Manresa",             "category":"outdoor","color":"#263238","initials":"MN","tag":"Workwear"},
  "william_ellery":         {"name":"William Ellery",      "category":"outdoor","color":"#4A4E69","initials":"WE","tag":"Workwear"},
  "fce_tools":              {"name":"F/CE.",               "category":"outdoor","color":"#1A1A2E","initials":"FC","tag":"Japanese"},
  "mountain_research":      {"name":"Mountain Research",   "category":"outdoor","color":"#37474F","initials":"MR","tag":"Japanese"},
  "meanswhile":             {"name":"Meanswhile",          "category":"outdoor","color":"#546E7A","initials":"MW","tag":"Japanese"},
  "cmfoutdoorgarment_official":{"name":"CMF Outdoor",      "category":"outdoor","color":"#263238","initials":"CM","tag":"Japanese"},
  "cayl_official":          {"name":"CAYL",                "category":"outdoor","color":"#4A4E69","initials":"CY","tag":"Korean"},
  "earthstudiesproject":    {"name":"Earth Studies",       "category":"outdoor","color":"#5D4037","initials":"ES","tag":"Boutique"},
  "sansan_gear":            {"name":"Sansan Gear",         "category":"outdoor","color":"#37474F","initials":"SG","tag":"Boutique"},
  "paagoworks.official":    {"name":"PaaGo Works",         "category":"outdoor","color":"#546E7A","initials":"PW","tag":"Japanese"},
  "bigrockcandymountaineering":{"name":"Big Rock Candy",   "category":"outdoor","color":"#6D4C41","initials":"BR","tag":"Boutique"},
}


def apify_fetch(dataset_id, fields=None, limit=200, offset=0):
    token_param = f"&token={APIFY_TOKEN}" if APIFY_TOKEN else ""
    field_param = f"&fields={','.join(fields)}" if fields else ""
    url = f"https://api.apify.com/v2/datasets/{dataset_id}/items?limit={limit}&offset={offset}{token_param}{field_param}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def fetch_all(dataset_id, fields=None):
    items, offset, limit = [], 0, 200
    while True:
        batch = apify_fetch(dataset_id, fields=fields, limit=limit, offset=offset)
        if not batch: break
        items.extend(batch)
        print(f"  Fetched {len(items)} items...")
        if len(batch) < limit: break
        offset += limit
        time.sleep(0.3)
    return items


def supabase_req(method, path, body=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation,resolution=merge-duplicates",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode()) if r.read else []
    except urllib.error.HTTPError as e:
        print(f"  Supabase error {e.code}: {e.read().decode()}")
        return None


# ── 1. FETCH POST DATA ────────────────────────────────────────
print("\n1. Fetching post data from Apify...")
posts = fetch_all(POST_DATASET, fields=["ownerUsername","likesCount","commentsCount","videoViewCount","type","timestamp"])
print(f"   Total posts: {len(posts)}")

# ── 2. AGGREGATE BY BRAND ─────────────────────────────────────
print("\n2. Aggregating by brand...")
agg = defaultdict(lambda: {"likes":[], "comments":[], "reel_views":[], "count":0})
for p in posts:
    u = (p.get("ownerUsername") or "").lower().strip()
    if not u: continue
    agg[u]["likes"].append(p.get("likesCount") or 0)
    agg[u]["comments"].append(p.get("commentsCount") or 0)
    if p.get("type") in ("Video","Reel","clips") and p.get("videoViewCount"):
        agg[u]["reel_views"].append(p["videoViewCount"])
    agg[u]["count"] += 1

print(f"   Brands with post data: {len(agg)}")

# ── 3. FETCH PROFILE DATA (followers) ─────────────────────────
print("\n3. Fetching profile data (followers)...")
profiles = fetch_all(PROFILE_DATASET, fields=["username","followersCount"])
follower_map = {p["username"].lower(): p.get("followersCount",0) for p in profiles if p.get("username")}
print(f"   Profiles loaded: {len(follower_map)}")

# ── 4. GET EXISTING BRANDS + METRICS FROM SUPABASE ───────────
print("\n4. Loading existing brands from Supabase...")
existing_raw = supabase_req("GET", "brands?select=id,handle&limit=500") or []
existing = {r["handle"].lstrip("@").lower(): r["id"] for r in existing_raw}
print(f"   Existing brands: {len(existing)}")

# Also load existing follower counts as fallback
existing_metrics_raw = supabase_req("GET", "latest_metrics?select=handle,followers&limit=500") or []
existing_followers = {r["handle"].lower(): r.get("followers", 0) for r in existing_metrics_raw}
print(f"   Existing metrics (for follower fallback): {len(existing_followers)}")

# ── 5. UPSERT BRANDS ─────────────────────────────────────────
print("\n5. Upserting brand records...")
new_brands = []
for handle, info in BRANDS.items():
    if handle not in existing:
        new_brands.append({
            "name":     info["name"],
            "handle":   handle,
            "category": info["category"],
            "color":    info["color"],
            "initials": info["initials"],
            "tag":      info["tag"],
            "instagram_url": f"https://www.instagram.com/{handle}/",
            "active":   True,
        })

if new_brands:
    # Insert in batches of 50
    for i in range(0, len(new_brands), 50):
        batch = new_brands[i:i+50]
        result = supabase_req("POST", "brands", batch)
        print(f"   Inserted {len(batch)} brands")
        time.sleep(0.5)

# Reload brand IDs after insert
existing_raw = supabase_req("GET", "brands?select=id,handle&limit=500") or []
brand_ids = {r["handle"].lstrip("@").lower(): r["id"] for r in existing_raw}
print(f"   Total brands in DB: {len(brand_ids)}")

# ── 6. UPSERT METRICS ─────────────────────────────────────────
print("\n6. Upserting monthly metrics...")
metrics_batch = []
no_data = []

for handle, info in BRANDS.items():
    brand_id = brand_ids.get(handle)
    if not brand_id:
        print(f"   WARNING: No brand_id for {handle}")
        continue

    followers = follower_map.get(handle, 0) or existing_followers.get(handle, 0) or existing_followers.get('@'+handle, 0)
    post_agg  = agg.get(handle, {})

    if post_agg and post_agg["likes"]:
        avg_likes    = round(sum(post_agg["likes"])    / len(post_agg["likes"]), 2)
        avg_comments = round(sum(post_agg["comments"]) / len(post_agg["comments"]), 2)
        posts_count  = post_agg["count"]
        avg_reels    = round(sum(post_agg["reel_views"]) / len(post_agg["reel_views"]), 2) if post_agg["reel_views"] else None
    else:
        no_data.append(handle)
        continue   # skip brands with no post data — keep existing metrics

    metrics_batch.append({
        "brand_id":      brand_id,
        "period_end":    PERIOD_END,
        "followers":     followers,
        "avg_likes":     avg_likes,
        "avg_comments":  avg_comments,
        "avg_reel_views": avg_reels,
        "posts_count":   posts_count,
    })

# Upsert in batches of 50
for i in range(0, len(metrics_batch), 50):
    batch = metrics_batch[i:i+50]
    supabase_req("POST", "monthly_metrics?on_conflict=brand_id,period_end", batch)
    print(f"   Upserted metrics {i+1}–{i+len(batch)}")
    time.sleep(0.5)

print(f"\n✅ Done!")
print(f"   Metrics upserted: {len(metrics_batch)}")
print(f"   Brands with no post data (skipped): {len(no_data)}")
if no_data: print(f"   {', '.join(no_data[:10])}{'...' if len(no_data)>10 else ''}")
