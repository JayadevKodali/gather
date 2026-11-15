import json
# One-off generator for data/venues.json. The JSON file is the source of truth; this just saves typing.
ALL = ["stepFree","accessibleToilet","babyChanging","toilets","wifi","bar","catering","parking","loading",
       "tables","chairs","staging","danceFloor","coatCheck","storage","setup",
       "av","projector","microphones","soundSystem","videoConferencing","avTechnician"]
def fac(yes="", no="", priced=None, confirm=""):
    out = {}
    for c in yes.split(): out[c] = {"state":"yes"}
    for c in no.split(): out[c] = {"state":"no"}
    for c,p in (priced or {}).items(): out[c] = {"state":"yes","charge":"priced","pricePence":p*100}
    for c in confirm.split(): out[c] = {"state":"yes","charge":"to_confirm"}
    return out   # anything not listed = not confirmed
STD = dict(start="2026-12-01", end="2027-06-30")
def av(closed=(), blocked=()): return {"from":STD["start"],"to":STD["end"],"closedWeekdays":list(closed),"blocked":sorted(blocked)}
O1,O2,O3,O4="owner@gather.test","owner2@gather.test","owner3@gather.test","owner4@gather.test"
V=[]
def v(slug,owner,name,nb,borough,vtype,suits,cap,model,price,facilities,avail,desc,access="",published=True):
    s,se,m=cap
    V.append({"slug":slug,"owner":owner,"name":name,"neighbourhood":nb,"borough":borough,"venueType":vtype,
      "suits":suits,"capacity":{"standing":s,"seated":se,"mixed":m},"pricingModel":model,"pricePence":price*100,
      "facilities":facilities,"availability":avail,"description":desc,"accessNotes":access,"published":published})
BASE="toilets wifi tables chairs"
v("v01-loom-room",O1,"The Loom Room","Shoreditch","Hackney","Warehouse studio",["corporate","birthday","private"],(120,70,90),"hire_fee",4200,
  fac(BASE+" stepFree accessibleToilet babyChanging bar loading setup staging coatCheck storage av projector soundSystem",
      "catering parking danceFloor videoConferencing",{"microphones":80,"avTechnician":180}),
  av((0,),["2026-12-24","2026-12-25","2027-03-20","2027-04-17"]),
  "A double-height former textile floor with exposed brick, timber beams and big Crittall windows.",
  "Level entrance and event room. Accessible shared toilet on the same floor.")
v("v02-copper-arch",O1,"Copper Arch Studio","Hackney Wick","Hackney","Event studio",["corporate","birthday","private","wedding"],(100,60,80),"min_spend",5100,
  fac(BASE+" bar catering parking loading setup danceFloor coatCheck av projector soundSystem videoConferencing","staging storage microphones avTechnician"),
  av((0,1),["2027-03-26","2027-04-17"]),"A canal-side studio with a copper-clad bar and a big roller door onto the towpath.",
  "Entrance route and accessible toilet not yet confirmed by the owner.")
v("v03-glass-yard",O2,"The Glass Yard","Bethnal Green","Tower Hamlets","Courtyard venue",["birthday","private","wedding"],(95,65,75),"per_head",65,
  fac("tables chairs bar av microphones soundSystem danceFloor","stepFree babyChanging catering parking loading staging storage projector",confirm="setup"),
  av((0,),["2027-04-17"]),"A glazed courtyard under a lattice of festoon lights, with a small bar in the old coach house.",
  "Two steps at the event entrance.")
v("v04-alder-dining",O2,"Alder Private Dining","Shoreditch","Hackney","Private dining room",["birthday","private","corporate"],(45,32,None),"hire_fee",1800,
  fac(BASE+" stepFree accessibleToilet babyChanging catering bar setup","av projector microphones soundSystem danceFloor staging parking coatCheck storage videoConferencing avTechnician"),
  av((0,1)),"A candlelit room above an open kitchen, with one long oak table.","Level route from the entrance to the dining room.")
v("v05-fennel-finch",O3,"Fennel & Finch Upper Room","Clerkenwell","Islington","Restaurant private room",["corporate","birthday","private"],(50,40,45),"min_spend",2500,
  fac(BASE+" stepFree accessibleToilet catering bar av setup",priced={"projector":120,"microphones":60}),
  av((0,)),"A bright first-floor dining room with a private bar and a lift from the street.","Lift to the first floor. Accessible toilet on the same level.")
v("v06-saltbox-gallery",O3,"Saltbox Gallery","Hoxton","Hackney","Gallery",["corporate","private","birthday"],(150,80,110),"hire_fee",3800,
  fac(BASE+" stepFree accessibleToilet loading storage","bar catering parking danceFloor"),
  av((0,1),["2027-03-19"]),"White walls, polished concrete and gallery lighting. You bring the bar.",
  "Step-free throughout. AV is available on request but the owner has not confirmed what.")
v("v07-kiln-rooms",O1,"The Kiln Rooms","Dalston","Hackney","Converted pottery warehouse",["birthday","wedding","private","corporate"],(200,120,160),"hire_fee",6500,
  fac(BASE+" stepFree accessibleToilet bar loading setup danceFloor staging coatCheck av soundSystem microphones","parking catering",{"avTechnician":220}),
  av((0,),["2027-04-17","2027-05-01"]),"Three old kiln bays opened into one long room with a raised stage at one end.")
v("v08-brickwork-social",O4,"Brickwork Social","Spitalfields","Tower Hamlets","Bar with function room",["birthday","private","corporate"],(80,40,60),"min_spend",3000,
  fac(BASE+" bar catering av microphones soundSystem coatCheck","stepFree parking loading danceFloor"),
  av((0,),["2027-03-26"]),"A basement function room under a busy Spitalfields bar, with its own entrance.","Basement, stairs only.")
v("v09-thimble-thread",O4,"Thimble & Thread","Bermondsey","Southwark","Former tailor's workshop",["private","birthday","corporate"],(60,40,50),"hire_fee",1900,
  fac(BASE+" stepFree setup storage","av projector soundSystem bar catering parking"),
  av((0,)),"A workshop with long cutting tables, now a calm space for dinners and workshops.")
v("v10-signal-box",O2,"Riverside Signal Box","Wapping","Tower Hamlets","Riverside loft",["corporate","wedding","private"],(140,90,110),"hire_fee",5800,
  fac(BASE+" stepFree accessibleToilet bar catering loading setup av projector microphones soundSystem videoConferencing","danceFloor parking"),
  av((0,),["2027-04-17"]),"A riverside loft with a wraparound balcony looking down the Thames.")
v("v11-orchard-rooftop",O3,"Orchard House Rooftop","London Bridge","Southwark","Rooftop terrace",["corporate","birthday","private"],(180,80,120),"per_head",48,
  fac(BASE+" stepFree accessibleToilet bar catering setup","danceFloor parking",{"av":250,"soundSystem":150}),
  av((0,),["2027-04-17"]),"A planted rooftop with a retractable canopy and views over the river.","Lift to the roof.")
v("v12-tin-chapel",O4,"The Tin Chapel","Peckham","Southwark","Converted chapel hall",["wedding","private","birthday"],(220,160,180),"hire_fee",3200,
  fac(BASE+" danceFloor staging setup storage soundSystem","stepFree accessibleToilet catering parking av"),
  av((0,1,2),["2027-05-22"]),"A corrugated-iron chapel from the 1890s with a high timber roof.","Three steps at the main door. No ramp yet.")
v("v13-marlowe-club",O1,"Marlowe Members' Club","Soho","Westminster","Members' club",["corporate","private","birthday"],(90,60,70),"min_spend",7500,
  fac(BASE+" stepFree bar catering coatCheck av projector microphones","danceFloor parking loading"),
  av((0,)),"Panelled rooms and a long zinc bar on a quiet Soho street.")
v("v14-cinder-screening",O2,"Cinder Screening Room","King's Cross","Camden","Screening room",["corporate","town_hall","private"],(None,70,None),"hire_fee",2200,
  fac(BASE+" stepFree accessibleToilet av projector microphones soundSystem videoConferencing","danceFloor catering bar"),
  av((0,)),"A 70-seat screening room with raked seats, a big screen and a small bar foyer.","Step-free to the back row.")
v("v15-lamplight-library",O3,"The Lamplight Library","Bloomsbury","Camden","Library hall",["corporate","town_hall","wedding"],(120,100,110),"hire_fee",4500,
  fac(BASE+" stepFree accessibleToilet catering setup av projector microphones soundSystem videoConferencing","danceFloor bar parking",{"avTechnician":200}),
  av((0,6)),"A galleried reading room with green lamps and space for a lectern.")
v("v16-mv-wren",O4,"MV Wren","Greenwich","Greenwich","Riverboat",["birthday","private","wedding"],(100,60,80),"per_head",72,
  fac("toilets tables chairs bar catering danceFloor soundSystem","stepFree accessibleToilet parking"),
  av((1,2)),"A restored river cruiser that leaves from Greenwich pier for three-hour evening sailings.","Gangway with steps.")
v("v17-foundry-hall",O1,"Foundry Hall","Bow","Tower Hamlets","Large warehouse",["corporate","wedding","private","town_hall"],(400,250,320),"hire_fee",9500,
  fac(BASE+" stepFree accessibleToilet bar loading setup staging danceFloor coatCheck storage parking av projector microphones soundSystem videoConferencing",priced={"avTechnician":300}),
  av((0,),["2027-04-17","2027-06-12"]),"A former bell foundry with a steel-truss roof and room for 400.")
v("v18-pinehurst-suite",O3,"Pinehurst Conference Suite","Liverpool Street","City of London","Hotel meeting room",["corporate","town_hall"],(150,120,130),"per_head",58,
  fac(BASE+" stepFree accessibleToilet babyChanging catering coatCheck setup av projector microphones soundSystem videoConferencing avTechnician","danceFloor bar parking"),
  av((0,6)),"A day-light conference suite two minutes from Liverpool Street. Per-head rate includes lunch.")
v("v19-wren-lane-loft",O2,"Wren Lane Loft","Clerkenwell","Islington","Loft",["private","birthday","corporate"],(35,24,30),"hire_fee",900,
  fac(BASE+" setup","stepFree accessibleToilet av bar catering"),
  av((0,)),"A small top-floor loft with skylights. Bring your own drinks.","Fourth floor, no lift.")
v("v20-little-ember",O4,"Little Ember Supper Club","Hackney Central","Hackney","Supper club",["birthday","private"],(18,12,None),"per_head",55,
  fac(BASE+" catering bar","av stepFree projector"),
  av((0,1)),"Twelve seats around a single counter facing a wood-fired grill.")
v("v21-hollow-oak",O3,"Hollow Oak Function Room","Kentish Town","Camden","Pub function room",["birthday","private","corporate"],(75,50,60),"min_spend",1200,
  fac(BASE+" bar catering av soundSystem microphones","stepFree accessibleToilet danceFloor"),
  av((0,)),"A wood-panelled room upstairs at a neighbourhood pub, with its own bar.","Upstairs, no lift.")
v("v22-northlight-studio",O1,"Northlight Studio","Hackney Wick","Hackney","Photography studio",["corporate","private"],(60,30,40),"hire_fee",1500,
  fac(BASE+" stepFree loading av","bar catering"),
  av((0,)),"A white-cyclorama daylight studio. Draft listing: not yet published.",published=False)
v("v23-southbank-terrace",O2,"Southbank Terrace Room","Waterloo","Lambeth","Terrace room",["corporate","wedding","private"],(130,80,100),"hire_fee",4800,
  fac(BASE+" stepFree accessibleToilet bar catering setup av projector microphones","danceFloor parking"),
  av((0,)),"A glass-fronted room opening onto a riverside terrace.")
v("v24-brixton-vaults",O4,"Brixton Vaults","Brixton","Lambeth","Railway arch",["birthday","private"],(250,120,180),"hire_fee",4000,
  fac(BASE+" stepFree accessibleToilet bar danceFloor soundSystem staging loading av","catering parking projector"),
  av((1,2,3),["2027-04-17"]),"Two joined railway arches with a proper sound system and a dance floor.")
v("v25-deptford-printworks",O3,"Deptford Printworks","Deptford","Lewisham","Print warehouse",["corporate","wedding","private","birthday"],(300,180,240),"hire_fee",5500,
  fac(BASE+" stepFree accessibleToilet loading setup storage staging danceFloor parking av soundSystem","catering",{"projector":150,"microphones":90}),
  av((0,)),"A cavernous ex-print hall with gantry lights and a loading bay.")
v("v26-battersea-glasshouse",O1,"Battersea Glasshouse","Battersea","Wandsworth","Glasshouse",["wedding","private","corporate"],(160,110,130),"per_head",85,
  fac(BASE+" stepFree accessibleToilet babyChanging bar catering setup danceFloor coatCheck parking soundSystem","av projector"),
  av((1,2)),"A Victorian glasshouse in a walled garden. Per-head rate includes a three-course menu.")
v("v27-drawing-room",O2,"The Notting Hill Drawing Room","Notting Hill","Kensington and Chelsea","Townhouse drawing room",["private","birthday","wedding"],(40,28,32),"hire_fee",2600,
  fac(BASE+" catering bar","stepFree accessibleToilet av danceFloor"),
  av((0,)),"A first-floor drawing room with tall sash windows and a piano.","Stairs only.")
v("v28-stratford-atrium",O4,"Stratford Atrium","Stratford","Newham","Atrium event space",["corporate","town_hall","wedding"],(350,200,280),"hire_fee",6000,
  fac(BASE+" stepFree accessibleToilet babyChanging catering parking loading setup staging av projector microphones soundSystem videoConferencing avTechnician","danceFloor"),
  av((0,6)),"A four-storey glass atrium in an office campus, available evenings and some weekdays.")
v("v29-assembly-rooms",O3,"Walthamstow Assembly Hall","Walthamstow","Waltham Forest","Community hall",["birthday","private","wedding"],(200,150,170),"hire_fee",1400,
  fac(BASE+" stepFree accessibleToilet babyChanging staging danceFloor parking","bar av"),
  None,"A sprung-floor community hall with a stage. The owner hasn't confirmed any dates yet.")
v("v30-angel-canal-room",O2,"Angel Canal Room","Angel","Islington","Canal-side room",["corporate","birthday","private"],(90,56,70),"per_head",42,
  fac(BASE+" stepFree accessibleToilet bar catering av projector","danceFloor parking"),
  av((0,),["2027-03-26"]),"A narrow room on the Regent's Canal with a terrace for drinks.")
v("v31-cellar-aldgate",O4,"The Aldgate Cellar","Aldgate","City of London","Wine cellar",["corporate","private","birthday"],(55,30,40),"min_spend",2000,
  fac(BASE+" bar catering coatCheck","stepFree accessibleToilet av danceFloor"),
  av((0,6)),"Brick vaults under a wine merchant, lit by candles.","Steep stairs, no lift.")
v("v32-fitzrovia-glass-box",O1,"Fitzrovia Glass Box","Fitzrovia","Camden","Modern event space",["corporate","town_hall","private"],(110,70,90),"hire_fee",3600,
  fac(BASE+" stepFree accessibleToilet catering setup av projector microphones videoConferencing","danceFloor parking bar"),
  av((0,6)),"A glass-walled ground-floor space with a clean, flexible layout.")
assert len(V)==32 and len({x["slug"] for x in V})==32
print(json.dumps({"_note":"Synthetic fixtures for the Gather work test. Every venue, owner and address is fictional.","venues":V},indent=1,ensure_ascii=False))
