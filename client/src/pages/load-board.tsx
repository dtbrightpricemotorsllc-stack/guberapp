import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { GuberLayout } from "@/components/guber-layout";
import { Button } from "@/components/ui/button";
import {
  Truck, ChevronRight, Plus, MapPin, Zap, Loader2,
  ShieldCheck, Map as MapIcon, List, User2, Star,
} from "lucide-react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

// ── Category definitions ───────────────────────────────────────────────────────
const CATEGORIES = [
  { value: "vehicle",   label: "Vehicles",        emoji: "🚗", desc: "Cars, trucks, motorcycles" },
  { value: "boat",      label: "Boats",            emoji: "⛵", desc: "Sailboats, motorboats, PWCs" },
  { value: "rv",        label: "RVs & Campers",    emoji: "🚐", desc: "Motorhomes, travel trailers" },
  { value: "equipment", label: "Heavy Equipment",  emoji: "🏗️", desc: "Construction, farm, industrial" },
  { value: "trailer",   label: "Trailers",         emoji: "🚛", desc: "Flatbed, enclosed, utility" },
  { value: "hotshot",   label: "Hotshot Loads",    emoji: "⚡", desc: "Time-critical, LTL freight" },
] as const;

type CategoryValue = typeof CATEGORIES[number]["value"] | "all";

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  posted:         { label: "Open",           color: "text-cyan-400",   dot: "bg-cyan-400" },
  offer_received: { label: "Offer In",       color: "text-amber-400",  dot: "bg-amber-400" },
  offer_accepted: { label: "Offer Accepted", color: "text-sky-400",    dot: "bg-sky-400" },
  connected:      { label: "Connected",      color: "text-violet-400", dot: "bg-violet-400" },
  cancelled:      { label: "Cancelled",      color: "text-gray-500",   dot: "bg-gray-500" },
};

const PROOF_LABEL: Record<string, string> = {
  title_in_hand:   "Title In Hand",
  bill_of_sale:    "Bill of Sale",
  auction_invoice: "Auction Invoice",
  dealer_owned:    "Dealer",
  lienholder:      "Lienholder",
  not_ready:       "Proof Pending",
};

function transportEmoji(type: string) {
  const map: Record<string, string> = {
    vehicle: "🚗", boat: "⛵", rv: "🚐",
    equipment: "🏗️", trailer: "🚛", hotshot: "⚡",
  };
  return map[type] ?? "📦";
}

// ── City-level coordinates lookup (city name lowercase → {lat,lng}) ───────────
// Covers ~1,200 US cities. Fallback: state center if city not found.
const STATE_CENTERS: Record<string, { lat: number; lng: number }> = {
  AL:{lat:32.8,lng:-86.8},AK:{lat:61.4,lng:-152.0},AZ:{lat:34.3,lng:-111.1},
  AR:{lat:34.9,lng:-92.4},CA:{lat:36.8,lng:-119.4},CO:{lat:39.1,lng:-105.4},
  CT:{lat:41.6,lng:-72.7},DE:{lat:39.0,lng:-75.5},FL:{lat:27.8,lng:-81.8},
  GA:{lat:32.2,lng:-83.4},HI:{lat:20.3,lng:-156.4},ID:{lat:44.4,lng:-114.6},
  IL:{lat:40.0,lng:-89.2},IN:{lat:39.9,lng:-86.3},IA:{lat:42.1,lng:-93.5},
  KS:{lat:38.5,lng:-98.4},KY:{lat:37.7,lng:-84.9},LA:{lat:31.2,lng:-92.1},
  ME:{lat:45.4,lng:-69.0},MD:{lat:39.1,lng:-76.8},MA:{lat:42.2,lng:-71.5},
  MI:{lat:43.3,lng:-84.5},MN:{lat:46.4,lng:-93.1},MS:{lat:32.7,lng:-89.7},
  MO:{lat:38.3,lng:-92.5},MT:{lat:46.9,lng:-110.5},NE:{lat:41.1,lng:-98.3},
  NV:{lat:39.5,lng:-116.9},NH:{lat:43.7,lng:-71.6},NJ:{lat:40.1,lng:-74.5},
  NM:{lat:34.8,lng:-106.2},NY:{lat:42.2,lng:-74.9},NC:{lat:35.6,lng:-79.4},
  ND:{lat:47.5,lng:-100.5},OH:{lat:40.4,lng:-82.8},OK:{lat:35.6,lng:-96.9},
  OR:{lat:43.9,lng:-120.6},PA:{lat:40.6,lng:-77.2},RI:{lat:41.7,lng:-71.5},
  SC:{lat:33.9,lng:-80.9},SD:{lat:44.4,lng:-100.2},TN:{lat:35.9,lng:-86.7},
  TX:{lat:31.5,lng:-99.3},UT:{lat:39.3,lng:-111.1},VT:{lat:44.1,lng:-72.7},
  VA:{lat:37.8,lng:-78.2},WA:{lat:47.4,lng:-120.6},WV:{lat:38.9,lng:-80.5},
  WI:{lat:44.3,lng:-89.6},WY:{lat:42.9,lng:-107.6},DC:{lat:38.9,lng:-77.0},
};

const CITY_COORDS: Record<string, [number, number]> = {
  // Alabama
  "birmingham,al":[33.5186,-86.8104],"huntsville,al":[34.7304,-86.5861],"mobile,al":[30.6954,-88.0399],
  "montgomery,al":[32.3668,-86.2999],"tuscaloosa,al":[33.2098,-87.5692],"hoover,al":[33.4053,-86.8114],
  "dothan,al":[31.2232,-85.3905],"auburn,al":[32.6098,-85.4808],"decatur,al":[34.6059,-86.9833],
  "madison,al":[34.699,-86.7483],"florence,al":[34.7998,-87.6773],"gadsden,al":[33.9984,-86.0072],
  "gulf shores,al":[30.2460,-87.7008],"fairhope,al":[30.5227,-87.9036],"spanish fort,al":[30.6746,-87.9142],
  // Alaska
  "anchorage,ak":[61.2181,-149.9003],"fairbanks,ak":[64.8378,-147.7164],"juneau,ak":[58.3005,-134.4197],
  // Arizona
  "phoenix,az":[33.4484,-112.0740],"tucson,az":[32.2217,-110.9265],"mesa,az":[33.4152,-111.8315],
  "chandler,az":[33.3062,-111.8413],"scottsdale,az":[33.4942,-111.9261],"gilbert,az":[33.3528,-111.7890],
  "glendale,az":[33.5387,-112.1860],"tempe,az":[33.4255,-111.9400],"peoria,az":[33.5806,-112.2374],
  "flagstaff,az":[35.1983,-111.6513],"yuma,az":[32.6927,-114.6277],"surprise,az":[33.6292,-112.3679],
  "avondale,az":[33.4356,-112.3496],"goodyear,az":[33.4353,-112.3576],"lake havasu city,az":[34.4839,-114.3224],
  // Arkansas
  "little rock,ar":[34.7465,-92.2896],"fort smith,ar":[35.3859,-94.3985],"fayetteville,ar":[36.0626,-94.1574],
  "springdale,ar":[36.1867,-94.1288],"jonesboro,ar":[35.8423,-90.7043],"north little rock,ar":[34.7695,-92.2674],
  "conway,ar":[35.0887,-92.4421],"rogers,ar":[36.3320,-94.1185],"bentonville,ar":[36.3729,-94.2088],
  // California
  "los angeles,ca":[34.0522,-118.2437],"san diego,ca":[32.7157,-117.1611],"san jose,ca":[37.3382,-121.8863],
  "san francisco,ca":[37.7749,-122.4194],"fresno,ca":[36.7378,-119.7871],"sacramento,ca":[38.5816,-121.4944],
  "long beach,ca":[33.7701,-118.1937],"oakland,ca":[37.8044,-122.2712],"bakersfield,ca":[35.3733,-119.0187],
  "anaheim,ca":[33.8353,-117.9145],"santa ana,ca":[33.7455,-117.8677],"riverside,ca":[33.9806,-117.3755],
  "stockton,ca":[37.9577,-121.2908],"chula vista,ca":[32.6401,-117.0842],"irvine,ca":[33.6846,-117.8265],
  "fremont,ca":[37.5485,-121.9886],"san bernardino,ca":[34.1083,-117.2898],"modesto,ca":[37.6391,-120.9969],
  "fontana,ca":[34.0922,-117.4350],"moreno valley,ca":[33.9425,-117.2297],"glendale,ca":[34.1425,-118.2551],
  "huntington beach,ca":[33.6595,-117.9988],"santa clarita,ca":[34.3917,-118.5426],"garden grove,ca":[33.7739,-117.9614],
  "oceanside,ca":[33.1959,-117.3795],"rancho cucamonga,ca":[34.1064,-117.5931],"santa rosa,ca":[38.4404,-122.7141],
  "ontario,ca":[34.0633,-117.6509],"elk grove,ca":[38.4088,-121.3716],"corona,ca":[33.8753,-117.5664],
  "palmdale,ca":[34.5794,-118.1165],"salinas,ca":[36.6777,-121.6555],"pomona,ca":[34.0551,-117.7500],
  "escondido,ca":[33.1192,-117.0864],"torrance,ca":[33.8358,-118.3406],"hayward,ca":[37.6688,-122.0808],
  "sunnyvale,ca":[37.3688,-122.0363],"pasadena,ca":[34.1478,-118.1445],"orange,ca":[33.7879,-117.8531],
  "fullerton,ca":[33.8703,-117.9253],"thousand oaks,ca":[34.1705,-118.8376],"visalia,ca":[36.3302,-119.2921],
  "simi valley,ca":[34.2694,-118.7815],"concord,ca":[37.9780,-122.0311],"roseville,ca":[38.7521,-121.2880],
  "victorville,ca":[34.5362,-117.2928],"santa clara,ca":[37.3541,-121.9552],"vallejo,ca":[38.1041,-122.2566],
  "berkeley,ca":[37.8716,-122.2727],"el monte,ca":[34.0686,-118.0276],"murrieta,ca":[33.5539,-117.2139],
  "palm springs,ca":[33.8303,-116.5453],"oxnard,ca":[34.1975,-119.1771],"san luis obispo,ca":[35.2828,-120.6596],
  // Colorado
  "denver,co":[39.7392,-104.9903],"colorado springs,co":[38.8339,-104.8214],"aurora,co":[39.7294,-104.8319],
  "fort collins,co":[40.5853,-105.0844],"lakewood,co":[39.7047,-105.0814],"thornton,co":[39.8680,-104.9719],
  "arvada,co":[39.8028,-105.0875],"westminster,co":[39.8367,-105.0372],"pueblo,co":[38.2544,-104.6091],
  "boulder,co":[40.0150,-105.2705],"highlands ranch,co":[39.5480,-104.9697],"greeley,co":[40.4233,-104.7091],
  "longmont,co":[40.1672,-105.1019],"loveland,co":[40.3978,-105.0749],"broomfield,co":[39.9205,-105.0867],
  "castle rock,co":[39.3722,-104.8561],"commerce city,co":[39.8083,-104.9341],"grand junction,co":[39.0639,-108.5506],
  "durango,co":[37.2753,-107.8801],"steamboat springs,co":[40.4850,-106.8317],"vail,co":[39.6433,-106.3781],
  // Connecticut
  "bridgeport,ct":[41.1670,-73.2048],"new haven,ct":[41.3082,-72.9279],"hartford,ct":[41.7658,-72.6851],
  "stamford,ct":[41.0534,-73.5387],"waterbury,ct":[41.5582,-73.0515],"norwalk,ct":[41.1177,-73.4082],
  "danbury,ct":[41.3948,-73.4540],"new britain,ct":[41.6612,-72.7795],"bristol,ct":[41.6718,-72.9493],
  // Delaware
  "wilmington,de":[39.7447,-75.5484],"dover,de":[39.1582,-75.5244],"newark,de":[39.6837,-75.7497],
  // Florida
  "jacksonville,fl":[30.3322,-81.6557],"miami,fl":[25.7617,-80.1918],"tampa,fl":[27.9506,-82.4572],
  "orlando,fl":[28.5383,-81.3792],"st. petersburg,fl":[27.7676,-82.6403],"hialeah,fl":[25.8576,-80.2781],
  "tallahassee,fl":[30.4518,-84.2807],"fort lauderdale,fl":[26.1224,-80.1373],"port st. lucie,fl":[27.2939,-80.3503],
  "cape coral,fl":[26.5629,-81.9495],"pembroke pines,fl":[26.0070,-86.1414],"hollywood,fl":[26.0112,-80.1495],
  "gainesville,fl":[29.6516,-82.3248],"miramar,fl":[25.9871,-80.2329],"coral springs,fl":[26.2711,-80.2706],
  "clearwater,fl":[27.9659,-82.8001],"miami gardens,fl":[25.9420,-80.2456],"palm bay,fl":[28.0345,-80.5887],
  "pompano beach,fl":[26.2379,-80.1248],"west palm beach,fl":[26.7153,-80.0534],"lakeland,fl":[28.0395,-81.9498],
  "davie,fl":[26.0765,-80.2522],"miami beach,fl":[25.7907,-80.1300],"boca raton,fl":[26.3683,-80.1289],
  "deltona,fl":[28.9005,-81.2637],"plantation,fl":[26.1276,-80.2331],"sunrise,fl":[26.1670,-80.2562],
  "fort myers,fl":[26.6406,-81.8723],"palm coast,fl":[29.5844,-81.2079],"naples,fl":[26.1420,-81.7948],
  "pensacola,fl":[30.4213,-87.2169],"sarasota,fl":[27.3364,-82.5307],"ocala,fl":[29.1872,-82.1401],
  "daytona beach,fl":[29.2108,-81.0228],"deerfield beach,fl":[26.3184,-80.1000],"melbourne,fl":[28.0836,-80.6081],
  "boynton beach,fl":[26.5317,-80.0905],"homestead,fl":[25.4687,-80.4776],"destin,fl":[30.3935,-86.4958],
  "panama city,fl":[30.1588,-85.6602],"kissimmee,fl":[28.2919,-81.4076],"brandon,fl":[27.9378,-82.2859],
  "st. augustine,fl":[29.8943,-81.3145],
  // Georgia
  "atlanta,ga":[33.7490,-84.3880],"columbus,ga":[32.4610,-84.9877],"savannah,ga":[32.0835,-81.0998],
  "augusta,ga":[33.4735,-82.0105],"macon,ga":[32.8407,-83.6324],"roswell,ga":[34.0232,-84.3616],
  "albany,ga":[31.5785,-84.1557],"johns creek,ga":[34.0290,-84.1985],"warner robins,ga":[32.6130,-83.5996],
  "athens,ga":[33.9519,-83.3576],"sandy springs,ga":[33.9240,-84.3711],"south fulton,ga":[33.6392,-84.5855],
  "marietta,ga":[33.9526,-84.5499],"valdosta,ga":[30.8327,-83.2785],"smyrna,ga":[33.8840,-84.5144],
  "brunswick,ga":[31.1499,-81.4915],"gainesville,ga":[34.2979,-83.8241],
  // Idaho
  "boise,id":[43.6150,-116.2023],"nampa,id":[43.5407,-116.5635],"meridian,id":[43.6121,-116.3915],
  "idaho falls,id":[43.4666,-112.0340],"pocatello,id":[42.8713,-112.4455],"caldwell,id":[43.6629,-116.6874],
  "coeur d'alene,id":[47.6777,-116.7805],"twin falls,id":[42.5629,-114.4609],
  // Illinois
  "chicago,il":[41.8781,-87.6298],"aurora,il":[41.7606,-88.3201],"joliet,il":[41.5250,-88.0817],
  "rockford,il":[42.2711,-89.0940],"springfield,il":[39.7817,-89.6501],"elgin,il":[42.0354,-88.2826],
  "peoria,il":[40.6936,-89.5890],"champaign,il":[40.1164,-88.2434],"bloomington,il":[40.4842,-88.9937],
  "decatur,il":[39.8403,-88.9548],"evanston,il":[42.0450,-87.6877],"waukegan,il":[42.3636,-87.8448],
  "cicero,il":[41.8456,-87.7539],"naperville,il":[41.7508,-88.1535],"arlington heights,il":[42.0884,-87.9806],
  "bolingbrook,il":[41.6986,-88.0684],"schaumburg,il":[42.0334,-88.0834],"palatine,il":[42.1103,-88.0340],
  "quincy,il":[39.9356,-91.4099],"moline,il":[41.5067,-90.5151],
  // Indiana
  "indianapolis,in":[39.7684,-86.1581],"fort wayne,in":[41.1306,-85.1289],"evansville,in":[37.9716,-87.5711],
  "south bend,in":[41.6764,-86.2520],"carmel,in":[39.9784,-86.1180],"fishers,in":[39.9564,-85.9680],
  "bloomington,in":[39.1653,-86.5264],"hammond,in":[41.6303,-87.5002],"gary,in":[41.5934,-87.3469],
  "lafayette,in":[40.4167,-86.8753],"muncie,in":[40.1934,-85.3864],"terre haute,in":[39.4667,-87.4139],
  // Iowa
  "des moines,ia":[41.5868,-93.6250],"cedar rapids,ia":[41.9779,-91.6656],"davenport,ia":[41.5236,-90.5776],
  "sioux city,ia":[42.4999,-96.4003],"iowa city,ia":[41.6611,-91.5302],"waterloo,ia":[42.4928,-92.3426],
  "ames,ia":[42.0308,-93.6319],"west des moines,ia":[41.5772,-93.7113],"ankeny,ia":[41.7297,-93.6047],
  // Kansas
  "wichita,ks":[37.6872,-97.3301],"overland park,ks":[38.9822,-94.6708],"kansas city,ks":[39.1142,-94.6275],
  "olathe,ks":[38.8814,-94.8191],"topeka,ks":[39.0558,-95.6890],"lawrence,ks":[38.9717,-95.2353],
  "shawnee,ks":[38.9720,-94.7154],"manhattan,ks":[39.1836,-96.5717],"salina,ks":[38.8402,-97.6114],
  // Kentucky
  "louisville,ky":[38.2527,-85.7585],"lexington,ky":[38.0406,-84.5037],"bowling green,ky":[36.9685,-86.4808],
  "owensboro,ky":[37.7719,-87.1112],"covington,ky":[39.0837,-84.5086],"hopkinsville,ky":[36.8656,-87.4886],
  "richmond,ky":[37.7479,-84.2947],"florence,ky":[38.9990,-84.6268],"elizabethtown,ky":[37.6940,-85.8591],
  // Louisiana
  "new orleans,la":[29.9511,-90.0715],"baton rouge,la":[30.4515,-91.1871],"shreveport,la":[32.5252,-93.7502],
  "metairie,la":[29.9843,-90.1627],"lafayette,la":[30.2241,-92.0198],"lake charles,la":[30.2266,-93.2174],
  "bossier city,la":[32.5160,-93.7321],"monroe,la":[32.5093,-92.1193],"alexandria,la":[31.3113,-92.4452],
  "new iberia,la":[30.0035,-91.8187],"houma,la":[29.5958,-90.7195],"kenner,la":[29.9941,-90.2416],
  // Maine
  "portland,me":[43.6591,-70.2568],"lewiston,me":[44.1004,-70.2148],"bangor,me":[44.8016,-68.7712],
  "south portland,me":[43.6415,-70.2409],"auburn,me":[44.0978,-70.2312],
  // Maryland
  "baltimore,md":[39.2904,-76.6122],"columbia,md":[39.2037,-76.8610],"germantown,md":[39.1732,-77.2717],
  "silver spring,md":[38.9907,-77.0261],"waldorf,md":[38.6240,-76.9150],"frederick,md":[39.4143,-77.4105],
  "gaithersburg,md":[39.1432,-77.2014],"rockville,md":[39.0840,-77.1528],"annapolis,md":[38.9784,-76.4922],
  "hagerstown,md":[39.6418,-77.7199],"salisbury,md":[38.3607,-75.5994],
  // Massachusetts
  "boston,ma":[42.3601,-71.0589],"worcester,ma":[42.2626,-71.8023],"springfield,ma":[42.1015,-72.5898],
  "lowell,ma":[42.6334,-71.3162],"cambridge,ma":[42.3736,-71.1097],"new bedford,ma":[41.6362,-70.9342],
  "brockton,ma":[42.0834,-71.0184],"quincy,ma":[42.2529,-71.0023],"lynn,ma":[42.4668,-70.9495],
  "fall river,ma":[41.7015,-71.1550],"newton,ma":[42.3370,-71.2092],"somerville,ma":[42.3876,-71.0995],
  "lawrence,ma":[42.7070,-71.1631],"waltham,ma":[42.3765,-71.2356],"framingham,ma":[42.2793,-71.4162],
  // Michigan
  "detroit,mi":[42.3314,-83.0458],"grand rapids,mi":[42.9634,-85.6681],"warren,mi":[42.5145,-83.0147],
  "sterling heights,mi":[42.5803,-83.0302],"ann arbor,mi":[42.2808,-83.7430],"lansing,mi":[42.7325,-84.5555],
  "flint,mi":[43.0125,-83.6875],"dearborn,mi":[42.3223,-83.1763],"livonia,mi":[42.3684,-83.3527],
  "troy,mi":[42.6064,-83.1498],"westland,mi":[42.3242,-83.4002],"clinton township,mi":[42.5870,-82.9188],
  "kalamazoo,mi":[42.2917,-85.5872],"saginaw,mi":[43.4195,-83.9508],"pontiac,mi":[42.6389,-83.2911],
  "muskegon,mi":[43.2342,-86.2484],"battle creek,mi":[42.3212,-85.1797],"midland,mi":[43.6156,-84.2472],
  // Minnesota
  "minneapolis,mn":[44.9778,-93.2650],"saint paul,mn":[44.9537,-93.0900],"rochester,mn":[44.0121,-92.4802],
  "duluth,mn":[46.7867,-92.1005],"bloomington,mn":[44.8408,-93.3771],"brooklyn park,mn":[45.0941,-93.3743],
  "plymouth,mn":[45.0105,-93.4555],"maple grove,mn":[45.0724,-93.4557],"woodbury,mn":[44.9239,-92.9594],
  "st. cloud,mn":[45.5579,-94.1632],"eagan,mn":[44.8041,-93.1669],"eden prairie,mn":[44.8549,-93.4709],
  // Mississippi
  "jackson,ms":[32.2988,-90.1848],"gulfport,ms":[30.3674,-89.0928],"southaven,ms":[34.9890,-90.0126],
  "hattiesburg,ms":[31.3271,-89.2903],"biloxi,ms":[30.3960,-88.8853],"meridian,ms":[32.3643,-88.7037],
  "tupelo,ms":[34.2576,-88.7034],"olive branch,ms":[34.9618,-89.8295],"horn lake,ms":[34.9540,-90.0340],
  // Missouri
  "kansas city,mo":[39.0997,-94.5786],"st. louis,mo":[38.6270,-90.1994],"springfield,mo":[37.2090,-93.2923],
  "columbia,mo":[38.9517,-92.3341],"independence,mo":[39.0911,-94.4155],"lee's summit,mo":[38.9108,-94.3825],
  "o'fallon,mo":[38.8106,-90.6998],"st. joseph,mo":[39.7675,-94.8467],"st. charles,mo":[38.7881,-90.4974],
  "blue springs,mo":[39.0170,-94.2816],"joplin,mo":[37.0842,-94.5133],"florissant,mo":[38.7895,-90.3226],
  // Montana
  "billings,mt":[45.7833,-108.5007],"missoula,mt":[46.8721,-113.9940],"great falls,mt":[47.5002,-111.3008],
  "bozeman,mt":[45.6769,-111.0429],"butte,mt":[46.0038,-112.5348],"helena,mt":[46.5958,-112.0270],
  // Nebraska
  "omaha,ne":[41.2565,-95.9345],"lincoln,ne":[40.8136,-96.7026],"bellevue,ne":[41.1544,-95.9146],
  "grand island,ne":[40.9264,-98.3420],"kearney,ne":[40.6993,-99.0817],"fremont,ne":[41.4333,-96.4983],
  // Nevada
  "las vegas,nv":[36.1699,-115.1398],"henderson,nv":[36.0395,-114.9817],"reno,nv":[39.5296,-119.8138],
  "north las vegas,nv":[36.1989,-115.1175],"sparks,nv":[39.5349,-119.7527],"carson city,nv":[39.1638,-119.7674],
  "elko,nv":[40.8324,-115.7631],
  // New Hampshire
  "manchester,nh":[42.9956,-71.4548],"nashua,nh":[42.7654,-71.4676],"concord,nh":[43.2081,-71.5376],
  "derry,nh":[42.8809,-71.3273],"dover,nh":[43.1979,-70.8737],"rochester,nh":[43.3042,-70.9750],
  // New Jersey
  "newark,nj":[40.7357,-74.1724],"jersey city,nj":[40.7178,-74.0431],"paterson,nj":[40.9168,-74.1718],
  "elizabeth,nj":[40.6640,-74.2107],"lakewood,nj":[40.0979,-74.2177],"edison,nj":[40.5187,-74.4121],
  "woodbridge,nj":[40.5576,-74.2846],"toms river,nj":[39.9537,-74.1979],"hamilton,nj":[40.2287,-74.7254],
  "trenton,nj":[40.2170,-74.7429],"camden,nj":[39.9259,-75.1196],"clifton,nj":[40.8584,-74.1638],
  "cherry hill,nj":[39.9279,-75.0246],"passaic,nj":[40.8568,-74.1285],"union city,nj":[40.7662,-74.0321],
  // New Mexico
  "albuquerque,nm":[35.0844,-106.6504],"las cruces,nm":[32.3199,-106.7637],"rio rancho,nm":[35.2328,-106.6630],
  "santa fe,nm":[35.6870,-105.9378],"roswell,nm":[33.3943,-104.5230],"farmington,nm":[36.7281,-108.2087],
  "clovis,nm":[34.4048,-103.2052],
  // New York
  "new york,ny":[40.7128,-74.0060],"buffalo,ny":[42.8864,-78.8784],"rochester,ny":[43.1566,-77.6088],
  "yonkers,ny":[40.9312,-73.8988],"syracuse,ny":[43.0481,-76.1474],"albany,ny":[42.6526,-73.7562],
  "new rochelle,ny":[40.9115,-73.7824],"mount vernon,ny":[40.9126,-73.8371],"schenectady,ny":[42.8142,-73.9396],
  "utica,ny":[43.1009,-75.2327],"white plains,ny":[41.0340,-73.7629],"hempstead,ny":[40.7062,-73.6187],
  "brooklyn,ny":[40.6782,-73.9442],"queens,ny":[40.7282,-73.7949],"bronx,ny":[40.8448,-73.8648],
  "manhattan,ny":[40.7831,-73.9712],"staten island,ny":[40.5795,-74.1502],
  // North Carolina
  "charlotte,nc":[35.2271,-80.8431],"raleigh,nc":[35.7796,-78.6382],"greensboro,nc":[36.0726,-79.7920],
  "durham,nc":[35.9940,-78.8986],"winston-salem,nc":[36.0999,-80.2442],"fayetteville,nc":[35.0527,-78.8784],
  "cary,nc":[35.7915,-78.7811],"wilmington,nc":[34.2257,-77.9447],"high point,nc":[35.9557,-80.0053],
  "concord,nc":[35.4088,-80.5796],"asheville,nc":[35.5951,-82.5515],"gastonia,nc":[35.2620,-81.1873],
  "jacksonville,nc":[34.7540,-77.4302],"chapel hill,nc":[35.9132,-79.0558],"huntersville,nc":[35.4107,-80.8429],
  "apex,nc":[35.7327,-78.8502],"mooresville,nc":[35.5845,-80.8098],
  // North Dakota
  "fargo,nd":[46.8772,-96.7898],"bismarck,nd":[46.8083,-100.7837],"grand forks,nd":[47.9253,-97.0329],
  "minot,nd":[48.2325,-101.2963],
  // Ohio
  "columbus,oh":[39.9612,-82.9988],"cleveland,oh":[41.4993,-81.6944],"cincinnati,oh":[39.1031,-84.5120],
  "toledo,oh":[41.6639,-83.5552],"akron,oh":[41.0814,-81.5190],"dayton,oh":[39.7589,-84.1916],
  "parma,oh":[41.3845,-81.7229],"canton,oh":[40.7989,-81.3784],"youngstown,oh":[41.0998,-80.6495],
  "lorain,oh":[41.4523,-82.1824],"hamilton,oh":[39.3995,-84.5613],"springfield,oh":[39.9242,-83.8088],
  "kettering,oh":[39.6895,-84.1688],"elyria,oh":[41.3684,-82.1074],"lakewood,oh":[41.4820,-81.7982],
  "cuyahoga falls,oh":[41.1331,-81.4846],"euclid,oh":[41.5931,-81.5268],"middletown,oh":[39.5151,-84.3983],
  "mansfield,oh":[40.7584,-82.5154],
  // Oklahoma
  "oklahoma city,ok":[35.4676,-97.5164],"tulsa,ok":[36.1540,-95.9928],"norman,ok":[35.2226,-97.4395],
  "broken arrow,ok":[36.0526,-95.7908],"lawton,ok":[34.6086,-98.3959],"edmond,ok":[35.6528,-97.4781],
  "moore,ok":[35.3395,-97.4864],"midwest city,ok":[35.4495,-97.3967],"enid,ok":[36.3956,-97.8784],
  "stillwater,ok":[36.1156,-97.0584],
  // Oregon
  "portland,or":[45.5051,-122.6750],"salem,or":[44.9429,-123.0351],"eugene,or":[44.0521,-123.0868],
  "gresham,or":[45.5001,-122.4302],"hillsboro,or":[45.5229,-122.9898],"beaverton,or":[45.4871,-122.8037],
  "bend,or":[44.0582,-121.3153],"medford,or":[42.3265,-122.8756],"springfield,or":[44.0462,-123.0220],
  "corvallis,or":[44.5646,-123.2620],"albany,or":[44.6365,-123.1059],
  // Pennsylvania
  "philadelphia,pa":[39.9526,-75.1652],"pittsburgh,pa":[40.4406,-79.9959],"allentown,pa":[40.6084,-75.4902],
  "erie,pa":[42.1292,-80.0851],"reading,pa":[40.3356,-75.9269],"scranton,pa":[41.4090,-75.6624],
  "bethlehem,pa":[40.6259,-75.3705],"lancaster,pa":[40.0379,-76.3055],"harrisburg,pa":[40.2732,-76.8867],
  "altoona,pa":[40.5187,-78.3947],"york,pa":[39.9626,-76.7277],"state college,pa":[40.7934,-77.8600],
  "wilkes-barre,pa":[41.2459,-75.8813],"chester,pa":[39.8496,-75.3557],
  // Rhode Island
  "providence,ri":[41.8240,-71.4128],"cranston,ri":[41.7798,-71.4373],"woonsocket,ri":[42.0029,-71.5148],
  "pawtucket,ri":[41.8787,-71.3826],"east providence,ri":[41.8137,-71.3700],
  // South Carolina
  "columbia,sc":[34.0007,-81.0348],"charleston,sc":[32.7765,-79.9311],"north charleston,sc":[32.8546,-79.9748],
  "mount pleasant,sc":[32.8323,-79.8284],"rock hill,sc":[34.9249,-81.0251],"greenville,sc":[34.8526,-82.3940],
  "summerville,sc":[33.0185,-80.1756],"sumter,sc":[33.9204,-80.3412],"goose creek,sc":[32.9810,-80.0326],
  "hilton head island,sc":[32.2163,-80.7526],"florence,sc":[34.1954,-79.7626],"spartanburg,sc":[34.9496,-81.9321],
  "myrtle beach,sc":[33.6891,-78.8867],
  // South Dakota
  "sioux falls,sd":[43.5446,-96.7311],"rapid city,sd":[44.0805,-103.2310],"aberdeen,sd":[45.4647,-98.4865],
  "brookings,sd":[44.3114,-96.7984],
  // Tennessee
  "memphis,tn":[35.1495,-90.0490],"nashville,tn":[36.1627,-86.7816],"knoxville,tn":[35.9606,-83.9207],
  "chattanooga,tn":[35.0456,-85.3097],"clarksville,tn":[36.5298,-87.3595],"murfreesboro,tn":[35.8456,-86.3903],
  "franklin,tn":[35.9251,-86.8689],"jackson,tn":[35.6145,-88.8139],"johnson city,tn":[36.3134,-82.3535],
  "kingsport,tn":[36.5484,-82.5618],"brentwood,tn":[35.9334,-86.7827],"smyrna,tn":[35.9829,-86.5186],
  "columbia,tn":[35.6151,-87.0353],"spring hill,tn":[35.7512,-86.9300],
  // Texas
  "houston,tx":[29.7604,-95.3698],"san antonio,tx":[29.4241,-98.4936],"dallas,tx":[32.7767,-96.7970],
  "austin,tx":[30.2672,-97.7431],"fort worth,tx":[32.7555,-97.3308],"el paso,tx":[31.7619,-106.4850],
  "arlington,tx":[32.7357,-97.1081],"corpus christi,tx":[27.8006,-97.3964],"plano,tx":[33.0198,-96.6989],
  "lubbock,tx":[33.5779,-101.8552],"laredo,tx":[27.5064,-99.5075],"garland,tx":[32.9126,-96.6389],
  "irving,tx":[32.8140,-96.9489],"amarillo,tx":[35.2220,-101.8313],"grand prairie,tx":[32.7460,-97.0205],
  "brownsville,tx":[25.9017,-97.4975],"mckinney,tx":[33.1972,-96.6397],"frisco,tx":[33.1507,-96.8236],
  "mesquite,tx":[32.7668,-96.5992],"killeen,tx":[31.1171,-97.7278],"mcallen,tx":[26.2034,-98.2300],
  "pasadena,tx":[29.6911,-95.2091],"waco,tx":[31.5493,-97.1467],"denton,tx":[33.2148,-97.1331],
  "carrollton,tx":[32.9537,-96.8903],"midland,tx":[31.9973,-102.0779],"odessa,tx":[31.8457,-102.3676],
  "abilene,tx":[32.4487,-99.7331],"beaumont,tx":[30.0860,-94.1018],"round rock,tx":[30.5083,-97.6789],
  "richardson,tx":[32.9483,-96.7299],"pearland,tx":[29.5635,-95.2860],"lewisville,tx":[33.0462,-96.9942],
  "tyler,tx":[32.3513,-95.3011],"allen,tx":[33.1032,-96.6705],"college station,tx":[30.6280,-96.3344],
  "league city,tx":[29.5075,-95.0949],"sugar land,tx":[29.6197,-95.6349],"longview,tx":[32.5007,-94.7405],
  "edinburg,tx":[26.3017,-98.1633],"mission,tx":[26.2159,-98.3252],"bryan,tx":[30.6744,-96.3698],
  "pharr,tx":[26.1948,-98.1836],"san angelo,tx":[31.4638,-100.4370],"new braunfels,tx":[29.7030,-98.1245],
  "port arthur,tx":[29.8849,-93.9399],"wichita falls,tx":[33.9137,-98.4934],"temple,tx":[31.0982,-97.3428],
  // Utah
  "salt lake city,ut":[40.7608,-111.8910],"west valley city,ut":[40.6916,-111.9391],"provo,ut":[40.2338,-111.6585],
  "west jordan,ut":[40.6097,-111.9391],"orem,ut":[40.2969,-111.6946],"sandy,ut":[40.5649,-111.8389],
  "ogden,ut":[41.2230,-111.9738],"st. george,ut":[37.0965,-113.5684],"layton,ut":[41.0602,-111.9711],
  "south jordan,ut":[40.5621,-111.9293],"millcreek,ut":[40.6869,-111.8774],"taylorsville,ut":[40.6677,-111.9388],
  "logan,ut":[41.7370,-111.8338],"murray,ut":[40.6669,-111.8879],
  // Vermont
  "burlington,vt":[44.4759,-73.2121],"south burlington,vt":[44.4667,-73.1710],"rutland,vt":[43.6106,-72.9726],
  "barre,vt":[44.1970,-72.5020],"montpelier,vt":[44.2601,-72.5754],
  // Virginia
  "virginia beach,va":[36.8529,-75.9780],"norfolk,va":[36.8508,-76.2859],"chesapeake,va":[36.7682,-76.2875],
  "richmond,va":[37.5407,-77.4360],"newport news,va":[36.9787,-76.4300],"alexandria,va":[38.8048,-77.0469],
  "hampton,va":[37.0299,-76.3452],"roanoke,va":[37.2710,-79.9414],"portsmouth,va":[36.8354,-76.2983],
  "suffolk,va":[36.7282,-76.5836],"lynchburg,va":[37.4138,-79.1422],"harrisonburg,va":[38.4496,-78.8689],
  "charlottesville,va":[38.0293,-78.4767],"fredericksburg,va":[38.3032,-77.4605],
  "arlington,va":[38.8799,-77.1068],"manassas,va":[38.7509,-77.4753],
  // Washington
  "seattle,wa":[47.6062,-122.3321],"spokane,wa":[47.6588,-117.4260],"tacoma,wa":[47.2529,-122.4443],
  "vancouver,wa":[45.6387,-122.6615],"bellevue,wa":[47.6101,-122.2015],"kent,wa":[47.3809,-122.2348],
  "everett,wa":[47.9790,-122.2021],"renton,wa":[47.4829,-122.2171],"spokane valley,wa":[47.6732,-117.2394],
  "federal way,wa":[47.3223,-122.3126],"kirkland,wa":[47.6815,-122.2087],"bellingham,wa":[48.7519,-122.4787],
  "kennewick,wa":[46.2112,-119.1372],"yakima,wa":[46.6021,-120.5059],"redmond,wa":[47.6740,-122.1215],
  "marysville,wa":[48.0518,-122.1771],"pasco,wa":[46.2396,-119.1006],"richland,wa":[46.2856,-119.2845],
  "sammamish,wa":[47.6163,-122.0356],"olympia,wa":[47.0379,-122.9007],"shoreline,wa":[47.7557,-122.3424],
  // West Virginia
  "charleston,wv":[38.3498,-81.6326],"huntington,wv":[38.4192,-82.4452],"morgantown,wv":[39.6295,-79.9559],
  "parkersburg,wv":[39.2667,-81.5615],"wheeling,wv":[40.0640,-80.7209],
  // Wisconsin
  "milwaukee,wi":[43.0389,-87.9065],"madison,wi":[43.0731,-89.4012],"green bay,wi":[44.5133,-88.0133],
  "kenosha,wi":[42.5847,-87.8212],"racine,wi":[42.7261,-87.7829],"appleton,wi":[44.2619,-88.4154],
  "waukesha,wi":[43.0117,-88.2315],"oshkosh,wi":[44.0247,-88.5426],"eau claire,wi":[44.8113,-91.4985],
  "janesville,wi":[42.6828,-89.0187],"west allis,wi":[43.0167,-88.0073],"la crosse,wi":[43.8014,-91.2396],
  "sheboygan,wi":[43.7508,-87.7145],"wauwatosa,wi":[43.0495,-88.0076],
  // Wyoming
  "cheyenne,wy":[41.1400,-104.8202],"casper,wy":[42.8666,-106.3131],"laramie,wy":[41.3114,-105.5911],
  "gillette,wy":[44.2911,-105.5022],"rock springs,wy":[41.5875,-109.2029],
  // DC
  "washington,dc":[38.9072,-77.0369],
};

function cityCoords(city: string, state: string): { lat: number; lng: number } | null {
  const key = `${city.toLowerCase().trim()},${state.toLowerCase().trim()}`;
  const c = CITY_COORDS[key];
  if (c) return { lat: c[0], lng: c[1] };
  // Fuzzy: try just state center
  return STATE_CENTERS[state.toUpperCase()] ?? null;
}

// ── Load Board Map ─────────────────────────────────────────────────────────────
function LoadBoardMap({ listings, apiKey }: { listings: any[]; apiKey: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!apiKey || !mapRef.current) return;
    let cancelled = false;
    setOptions({ key: apiKey, version: "weekly" } as any);

    (async () => {
      try {
        const g = await importLibrary("maps") as any;
        if (cancelled || !mapRef.current) return;

        const map = new g.Map(mapRef.current, {
          center: { lat: 39.5, lng: -98.35 },
          zoom: 4,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
          styles: [
            { elementType: "geometry",             stylers: [{ color: "#111827" }] },
            { elementType: "labels.text.fill",     stylers: [{ color: "#6b7280" }] },
            { elementType: "labels.text.stroke",   stylers: [{ color: "#111827" }] },
            { featureType: "road", elementType: "geometry",         stylers: [{ color: "#1f2937" }] },
            { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#374151" }] },
            { featureType: "water", elementType: "geometry",        stylers: [{ color: "#0f172a" }] },
            { featureType: "landscape", elementType: "geometry",    stylers: [{ color: "#111827" }] },
            { featureType: "poi",     stylers: [{ visibility: "off" }] },
            { featureType: "transit", stylers: [{ visibility: "off" }] },
          ],
        });

        setMapReady(true);
        const infoWindow = new g.InfoWindow();

        for (const l of listings) {
          if (cancelled) return;
          const pickup = cityCoords(l.pickupCity || "", l.pickupState || "");
          const delivery = cityCoords(l.deliveryCity || "", l.deliveryState || "");
          if (!pickup) continue;

          const priceStr = l.pricingMode === "fixed" && l.postedPrice
            ? `$${Number(l.postedPrice).toLocaleString()}`
            : "Open to offers";
          const asset = l.year && l.make
            ? `${l.year} ${l.make}${l.model ? " " + l.model : ""}`.trim()
            : l.assetDescription || l.transportType;

          const routeColor = l.urgent ? "#f59e0b" : "#06b6d4";

          // Route line pickup → delivery
          if (delivery) {
            new g.Polyline({
              path: [pickup, delivery],
              geodesic: true,
              strokeColor: routeColor,
              strokeOpacity: 0.45,
              strokeWeight: 2,
              map,
            });

            // Delivery marker (hollow diamond)
            new g.Marker({
              map,
              position: delivery,
              icon: {
                path: g.SymbolPath.CIRCLE,
                scale: 5,
                fillColor: routeColor,
                fillOpacity: 0.25,
                strokeColor: routeColor,
                strokeWeight: 1.5,
              },
              zIndex: 1,
            });
          }

          // Pickup marker (solid, larger)
          const marker = new g.Marker({
            map,
            position: pickup,
            title: `${l.pickupCity} → ${l.deliveryCity}`,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 10,
              fillColor: routeColor,
              fillOpacity: 0.9,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
            zIndex: 10,
          });

          marker.addListener("click", () => {
            infoWindow.setContent(`
              <div style="font-family:system-ui,sans-serif;padding:6px 4px;min-width:210px">
                <div style="font-size:13px;font-weight:800;color:#111;line-height:1.3">
                  ${transportEmoji(l.transportType)} ${l.pickupCity}, ${l.pickupState} → ${l.deliveryCity}, ${l.deliveryState}
                </div>
                <div style="font-size:11px;color:#555;margin-top:3px">${asset}${l.estimatedMiles ? ` · ${Number(l.estimatedMiles).toLocaleString()} mi` : ""}</div>
                <div style="font-size:14px;font-weight:800;color:#0891b2;margin-top:5px">${priceStr}</div>
                <a href="/load-board/${l.id}" style="display:inline-block;margin-top:8px;padding:5px 14px;background:#0891b2;color:#fff;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none">View Details →</a>
              </div>
            `);
            infoWindow.open(map, marker);
          });
        }
      } catch {
        // silent — list view still works
      }
    })();

    return () => { cancelled = true; };
  }, [apiKey, listings]);

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ height: "calc(100dvh - 260px)", minHeight: 320 }}>
      <div ref={mapRef} className="w-full h-full" />
      {!mapReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ background: "rgba(17,24,39,0.9)" }}>
          <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
          <p className="text-xs text-muted-foreground/50 font-display font-bold">Loading map…</p>
        </div>
      )}
      {mapReady && (
        <div className="absolute bottom-3 left-3 rounded-xl px-3 py-2"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
          <span className="text-[10px] font-display font-bold text-cyan-400/70">● Pickup city · ○ Delivery · line = route</span>
        </div>
      )}
    </div>
  );
}

// ── Categories Hub ─────────────────────────────────────────────────────────────
function CategoriesScreen({
  allListings,
  myCount,
  isLoading,
  onSelect,
  onMyPostings,
}: {
  allListings: any[];
  myCount: number;
  isLoading: boolean;
  onSelect: (cat: CategoryValue) => void;
  onMyPostings: () => void;
}) {
  // Count open loads per category
  const open = allListings.filter(l => l.status === "posted" || l.status === "offer_received");
  const counts: Record<string, number> = {};
  for (const l of open) counts[l.transportType] = (counts[l.transportType] || 0) + 1;
  const totalOpen = open.length;

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-2xl p-4 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg,rgba(8,145,178,0.15),rgba(14,116,144,0.06))",
          border: "1px solid rgba(6,182,212,0.2)",
        }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-display font-black text-cyan-400/60 uppercase tracking-widest mb-1">
              Vehicles · Boats · RVs · Equipment · Trailers · Hotshot
            </p>
            <h2 className="text-2xl font-display font-black text-foreground leading-none">
              Load Board
            </h2>
            <p className="text-xs text-muted-foreground/50 mt-1">
              {isLoading ? "…" : `${totalOpen} open load${totalOpen !== 1 ? "s" : ""} available`}
            </p>
          </div>
          <Link href="/load-board/post">
            <Button
              size="sm"
              className="rounded-xl font-display font-black text-xs h-9 px-4 gap-1.5 shrink-0"
              style={{ background: "linear-gradient(135deg,#0891b2,#0e7490)" }}
              data-testid="button-post-load"
            >
              <Plus className="w-3.5 h-3.5" /> Post Load
            </Button>
          </Link>
        </div>
      </div>

      {/* Category grid */}
      <div>
        <p className="text-[10px] font-display font-black text-muted-foreground/40 uppercase tracking-widest mb-3">
          Browse by Category
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {CATEGORIES.map(cat => {
            const count = counts[cat.value] || 0;
            return (
              <button
                key={cat.value}
                onClick={() => onSelect(cat.value)}
                className="rounded-2xl p-4 text-left relative overflow-hidden active:scale-[0.97] transition-all"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(0,229,118,0.22)",
                }}
                data-testid={`category-${cat.value}`}
              >
                <div className="text-3xl mb-2 leading-none">{cat.emoji}</div>
                <p className="text-sm font-display font-black text-foreground leading-tight">{cat.label}</p>
                <p className="text-[10px] text-muted-foreground/40 mt-0.5 leading-tight">{cat.desc}</p>
                <div className="flex items-center justify-between mt-3">
                  {isLoading ? (
                    <span className="text-[10px] text-muted-foreground/30 font-display font-bold">—</span>
                  ) : count > 0 ? (
                    <span
                      className="text-[10px] font-display font-black px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(6,182,212,0.12)", color: "#67e8f9" }}
                    >
                      {count} open
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/25 font-display font-bold">None posted</span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* All Loads */}
      <button
        onClick={() => onSelect("all")}
        className="w-full rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-all"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(0,229,118,0.22)" }}
        data-testid="category-all"
      >
        <div className="text-2xl">📦</div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-display font-bold text-foreground">All Loads</p>
          <p className="text-[10px] text-muted-foreground/40">Every open transport listing</p>
        </div>
        {!isLoading && totalOpen > 0 && (
          <span
            className="text-[10px] font-display font-black px-2 py-0.5 rounded-full shrink-0"
            style={{ background: "rgba(6,182,212,0.10)", color: "#67e8f9" }}
          >
            {totalOpen}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground/25 shrink-0" />
      </button>

      {/* My Postings */}
      <button
        onClick={onMyPostings}
        className="w-full rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-all"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(139,92,246,0.35)" }}
        data-testid="button-my-postings"
      >
        <div className="p-2.5 rounded-xl shrink-0" style={{ background: "rgba(139,92,246,0.12)" }}>
          <User2 className="w-4 h-4 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-display font-bold text-foreground">My Postings</p>
          <p className="text-[10px] text-muted-foreground/40">Loads you've posted</p>
        </div>
        {myCount > 0 && (
          <span
            className="text-[10px] font-display font-black px-2 py-0.5 rounded-full shrink-0"
            style={{ background: "rgba(139,92,246,0.12)", color: "#c4b5fd" }}
          >
            {myCount}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground/25 shrink-0" />
      </button>

      {/* Carrier CTA */}
      <button
        onClick={() => window.location.href = "/carrier-profile"}
        className="w-full rounded-2xl p-3.5 flex items-center gap-3 active:scale-[0.98] transition-all"
        style={{
          background: "linear-gradient(135deg,rgba(8,145,178,0.08),rgba(14,116,144,0.04))",
          border: "1px solid rgba(6,182,212,0.15)",
        }}
        data-testid="banner-carrier-signup"
      >
        <div className="p-2 rounded-xl shrink-0" style={{ background: "rgba(6,182,212,0.12)" }}>
          <Truck className="w-4 h-4 text-cyan-400" strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-display font-bold text-cyan-300">Are you a carrier?</p>
          <p className="text-[10px] text-cyan-400/50 mt-0.5">Set up your profile · submit offers · get paid</p>
        </div>
        <ChevronRight className="w-4 h-4 text-cyan-400/30 shrink-0" />
      </button>
    </div>
  );
}

// ── Load List (filtered) ───────────────────────────────────────────────────────
function LoadList({ listings, isLoading }: { listings: any[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
      </div>
    );
  }
  if (listings.length === 0) {
    return (
      <div className="text-center py-16">
        <Truck className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" strokeWidth={1.2} />
        <p className="text-sm font-display font-bold text-muted-foreground">No open loads right now</p>
        <p className="text-xs text-muted-foreground/40 mt-1">Be the first — post a load</p>
        <Link href="/load-board/post">
          <Button className="mt-5 rounded-xl font-display font-black text-sm gap-2"
            style={{ background: "linear-gradient(135deg,#0891b2,#0e7490)" }}>
            <Plus className="w-4 h-4" /> Post a Load
          </Button>
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="list-load-board">
      {listings.map((l) => {
        const sc = STATUS_CONFIG[l.status] || STATUS_CONFIG.posted;
        const title = l.year && l.make
          ? `${l.year} ${l.make}${l.model ? " " + l.model : ""}`.trim()
          : l.assetDescription || "Transport Load";
        return (
          <Link key={l.id} href={`/load-board/${l.id}`}>
            <div
              className="rounded-2xl p-4 cursor-pointer active:scale-[0.98] transition-all"
              style={{
                background: l.addonFlags?.includes("premium_carrier_only")
                  ? "rgba(139,92,246,0.06)"
                  : "rgba(255,255,255,0.04)",
                border: l.addonFlags?.includes("premium_carrier_only")
                  ? "1px solid rgba(139,92,246,0.2)"
                  : "1px solid rgba(6,182,212,0.12)",
              }}
              data-testid={`card-load-${l.id}`}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-base">{transportEmoji(l.transportType)}</span>
                    <span
                      className="text-[10px] font-display font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(6,182,212,0.12)", color: "#67e8f9" }}
                    >
                      {l.transportType}
                    </span>
                    {l.urgent && (
                      <span className="text-[10px] font-display font-black text-amber-400 flex items-center gap-0.5">
                        <Zap className="w-2.5 h-2.5" /> URGENT
                      </span>
                    )}
                    {l.addonFlags?.includes("premium_carrier_only") && (
                      <span className="text-[10px] font-display font-black text-violet-400 flex items-center gap-0.5">
                        <ShieldCheck className="w-2.5 h-2.5" /> VERIFIED ONLY
                      </span>
                    )}
                    {sc && (
                      <span className={`text-[10px] font-display font-bold ${sc.color} flex items-center gap-1`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} inline-block`} />
                        {sc.label}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-display font-bold text-foreground leading-tight">{title}</p>
                  {l.ownershipProofStatus && (
                    <span
                      className="inline-block text-[9px] font-display font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md mt-1"
                      style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}
                    >
                      {PROOF_LABEL[l.ownershipProofStatus] || l.ownershipProofStatus}
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {l.postedPrice ? (
                    <p className="text-base font-display font-black text-cyan-300">
                      ${Number(l.postedPrice).toLocaleString()}
                    </p>
                  ) : l.pricingMode === "open_to_offers" ? (
                    <p className="text-xs font-display font-bold text-amber-400/80">Open to offers</p>
                  ) : null}
                  {l.suggestedLow && l.suggestedHigh && (
                    <p className="text-[9px] text-muted-foreground/30 mt-0.5">
                      Est. ${l.suggestedLow}–${l.suggestedHigh}
                    </p>
                  )}
                </div>
              </div>

              {/* Route */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 mb-2">
                <MapPin className="w-3 h-3 shrink-0 text-cyan-500/60" />
                <span className="font-display font-bold">{l.pickupCity}, {l.pickupState}</span>
                <span className="text-cyan-400/40 mx-0.5">→</span>
                <span className="font-display font-bold">{l.deliveryCity}, {l.deliveryState}</span>
                {l.estimatedMiles && (
                  <span className="ml-1 text-muted-foreground/30">· {Number(l.estimatedMiles).toLocaleString()} mi</span>
                )}
              </div>

              {/* Add-on chips */}
              {l.addonFlags && l.addonFlags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {l.addonFlags.slice(0, 4).map((f: string) => (
                    <span key={f}
                      className="text-[9px] font-display font-bold px-1.5 py-0.5 rounded-md"
                      style={{ background: "rgba(6,182,212,0.08)", color: "rgba(6,182,212,0.7)" }}>
                      {f.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[9px] text-muted-foreground/30">
                  {l.poster?.guberId && (
                    <span className="font-display font-bold tracking-wide">{l.poster.guberId}</span>
                  )}
                  {l.poster?.rating > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                      {Number(l.poster.rating).toFixed(1)}
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground/30">
                  {new Date(l.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function LoadBoard() {
  const [, navigate] = useLocation();
  // null = categories screen; "all"|"vehicle"|… = list screen; "mine" = my postings
  const [screen, setScreen] = useState<CategoryValue | "mine" | null>(null);
  const [view, setView] = useState<"list" | "map">("list");

  const { data: configData } = useQuery<{ googleMapsApiKey: string }>({ queryKey: ["/api/config"] });
  const apiKey = configData?.googleMapsApiKey ?? "";

  // Always fetch all listings (for counts on categories screen)
  const { data: allData, isLoading: allLoading } = useQuery<{ listings: any[] }>({
    queryKey: ["/api/load-board"],
    queryFn: () => fetch("/api/load-board", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  // My postings
  const { data: myData, isLoading: myLoading } = useQuery<{ listings: any[] }>({
    queryKey: ["/api/load-board/my"],
    queryFn: () => fetch("/api/load-board/my", { credentials: "include" }).then(r => r.json()),
    staleTime: 30_000,
  });

  const allListings = allData?.listings ?? [];
  const myListings  = myData?.listings ?? [];

  // Filtered list for selected category
  const filteredListings = screen === "mine"
    ? myListings
    : screen === "all" || screen === null
    ? allListings
    : allListings.filter(l => l.transportType === screen);

  const isLoading = screen === "mine" ? myLoading : allLoading;

  // Category label for the list header
  const catLabel = screen === "mine"
    ? "My Postings"
    : screen === "all"
    ? "All Loads"
    : CATEGORIES.find(c => c.value === screen)?.label ?? "";

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <GuberLayout
      title={screen ? catLabel : "Load Board"}
      showBack
      backHref={screen ? undefined : "/dashboard"}
      onBack={screen ? () => setScreen(null) : undefined}
    >
      <div className="px-4 pt-2" style={{ paddingBottom: "calc(68px + env(safe-area-inset-bottom,0px) + 16px)" }}>

        {/* ── Categories screen ── */}
        {screen === null && (
          <CategoriesScreen
            allListings={allListings}
            myCount={myListings.length}
            isLoading={allLoading}
            onSelect={cat => { setScreen(cat); setView("list"); }}
            onMyPostings={() => setScreen("mine")}
          />
        )}

        {/* ── List / map screen ── */}
        {screen !== null && (
          <>
            {/* Sub-header: category info + view toggle */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {screen !== "mine" && (
                  <span className="text-2xl leading-none">
                    {screen === "all" ? "📦" : CATEGORIES.find(c => c.value === screen)?.emoji}
                  </span>
                )}
                {screen === "mine" && <User2 className="w-5 h-5 text-violet-400" />}
                <div>
                  <p className="text-base font-display font-black text-foreground leading-tight">{catLabel}</p>
                  <p className="text-[10px] text-muted-foreground/40">
                    {isLoading ? "…" : `${filteredListings.filter(l => l.status === "posted" || l.status === "offer_received").length} open`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {screen !== "mine" && (
                  <button
                    onClick={() => setView(v => v === "list" ? "map" : "list")}
                    className="p-2 rounded-xl transition-all active:scale-95"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(0,229,118,0.22)" }}
                    data-testid="button-toggle-view"
                    title={view === "list" ? "Switch to map" : "Switch to list"}
                  >
                    {view === "list"
                      ? <MapIcon className="w-4 h-4 text-cyan-400" />
                      : <List className="w-4 h-4 text-cyan-400" />
                    }
                  </button>
                )}
                <Link href="/load-board/post">
                  <Button size="sm"
                    className="rounded-xl font-display font-black text-xs h-9 px-3 gap-1.5"
                    style={{ background: "linear-gradient(135deg,#0891b2,#0e7490)" }}
                    data-testid="button-post-load"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Content */}
            {view === "map" && screen !== "mine" ? (
              <LoadBoardMap listings={filteredListings} apiKey={apiKey} />
            ) : (
              <LoadList listings={filteredListings} isLoading={isLoading} />
            )}
          </>
        )}
      </div>

    </GuberLayout>
  );
}
