-- =====================================================================
--  Raaha vendor import — extracted from the old software's vCard export
--  Paste into the Supabase SQL Editor and press Run. Safe to run once.
--  A vendor whose name already exists is skipped, not duplicated.
-- =====================================================================

insert into vendors (name, category, phone, email, city, notes)
select v.name, v.category, v.phone, v.email, v.city, v.notes
from (values
  ('A R ENTERPRISES', 'other', '+918777817658', null, 'Kolkata', '700017 · West Bengal'),
  ('AARAMBH BRIDAL STUDIO', 'other', '+919038069686', null, 'Kolkata', '700016 · West Bengal'),
  ('AKSH DESIGNS', 'other', null, null, 'Kolkata', 'New Alipore · 700053 · West Bengal'),
  ('ANAAYA CREATIONS(PURPLE PEACOCK)', 'other', '+918910001518', null, 'Kolkata', '700026 · West Bengal'),
  ('ATWISHA FASHION HOUSE', 'other', '+919331147100', null, 'Kolkata', '700016 · West Bengal'),
  ('B R K APPARELS', 'other', '+919818299446', null, 'Noida', '201301 · Uttar Pradesh'),
  ('B R KAPOOR & SONS PRIVATE LIMITED', 'other', null, null, 'Delhi', '110006 · Delhi'),
  ('BHAIRAV EMBRO DESIGN PRIVATE LIMITED', 'embroidery', '+918700495456', null, 'Delhi', 'Okhla Industrial Area Phase-1 · 110020 · Delhi'),
  ('BINOD KUMAR CHOUDHARY', 'other', '+919830142090', null, 'Kolkata', '700007 · West Bengal'),
  ('CELEBRATION CLOTHING PRIVATE LIMITED', 'other', '+919820162480', null, 'Mumbai', 'Dadar West · 400028 · Maharashtra'),
  ('CHITRAKAR APPARELS PRIVATE LIMITED', 'other', null, null, 'Kolkata', 'Park Street · 700016 · West Bengal'),
  ('DEAVYA FASHION DIVAS', 'other', null, null, 'Delhi', 'Kamla Nagar · 110007 · Delhi'),
  ('DIYA CREATIONS', 'other', '+918851869989', null, 'Delhi', 'Mansarover Garden, Kirti Nagar · 110015 · Delhi'),
  ('DORI DESIGN STUDIO', 'other', '+919326464734', null, 'Mumbai', '400028 · Maharashtra'),
  ('FASHION BLOOMS', 'other', '+918777084802', null, 'Kolkata', '700053 · West Bengal'),
  ('FLAUNT', 'other', null, null, 'Kolkata', 'Salt Lake City · 700064 · West Bengal'),
  ('GEON ATTIRE', 'other', '+919831874988', null, 'Kolkata', '700007 · West Bengal'),
  ('HARYALI DESIGNER HUB', 'other', '+919831350720', null, 'Kolkata', '700016 · West Bengal'),
  ('HOUSE OF RITAS PRIVATE LIMITED', 'other', null, null, 'Delhi', '110028 · Delhi'),
  ('INIZIO TRENDZ(SAANSH)', 'other', null, null, null, 'West Bengal'),
  ('ISHUM DESIGNS', 'other', '+919818299443', null, 'Noida', '201301 · Uttar Pradesh'),
  ('KALIGHATA R N FASHION', 'other', '+918981205009', null, 'Kolkata', '700084 · West Bengal'),
  ('KAMAKSHI', 'other', '+919920078295', null, 'Mumbai', 'KAMAKSHI DESING STUDIO,10 BHOOMI PLAZA, MASJID GALLI, CEOSS BHAVANI SHANKAR ROAD, DADAR(W) MUMBAI-40 · 400028 · Maharashtra'),
  ('KANYA', 'other', '+91114150037', null, 'Delhi', '110005 · Delhi · Delhi landline'),
  ('KASAPA CREATION', 'other', '+919810230747', null, 'Delhi', 'Tagore Garden , New Delhi · 110027 · Delhi'),
  ('KIRTI CREATION', 'other', null, null, 'Delhi', '110028 · Delhi'),
  ('M/s ORCHID', 'other', '+918178127853', null, 'Delhi', '110028 · Delhi'),
  ('MAIDENS CREATION', 'other', '+917021136150', null, 'Mumbai', 'Dadar West · 400028 · Maharashtra'),
  ('NARITVA', 'other', '+919662057022', 'naritva68@gmail.com', 'Kolkata', '700017 · West Bengal'),
  ('NEHA COUTURE', 'other', '+919930022113', null, 'Mumbai', 'M J Marjket · 400002 · Maharashtra'),
  ('NIKHAAR FASHIONS HERITAGE', 'other', '+919529345345', null, 'Jaipur', 'Trimurti Circle · 302004 · Rajasthan'),
  ('NILESH CREATIONS', 'other', '+91114019080', null, 'Delhi', '110015 · Delhi · Delhi landline'),
  ('NILIMA CREATIONS', 'other', '+918910046625', null, 'Kolkata', '700016 · West Bengal'),
  ('NITYA) SARBANI SAREES PVT LTD kolkata', 'other', '+919874183445', null, 'Kolkata', 'Park Street · 700016 · West Bengal'),
  ('ONAYA FASHIONS PRIVATE LIMITED', 'other', '+916292240588', null, 'Kolkata', '700016 · West Bengal'),
  ('PRASHVVITA FASHION PRIVATE LIMITED', 'other', null, null, 'Mumbai', '400086 · Maharashtra'),
  ('QUEEN''S CREATION', 'other', null, null, 'Kolkata', '700016 · West Bengal'),
  ('R.F. DESIGHERS', 'other', '+919829373990', null, 'Jaipur', 'M.i Road Jaipur · 302003 · Rajasthan'),
  ('R.F.COUTURE', 'other', null, null, 'Jaipur', '302001 · Rajasthan · dummy number 1234567899 in old software — get the real one'),
  ('RADHA TRADITIONS', 'other', null, null, 'Mumbai', 'Dadar West · 400028 · Maharashtra'),
  ('RARO HOUSE OF FASHION PRIVATE LIMITED', 'other', '+919999016771', null, 'Delhi', 'Pvr · 110028 · Delhi'),
  ('RASIYA', 'other', '+919811400262', null, 'Delhi', 'Phase-1 · 110028 · Delhi'),
  ('RITIKA & RASHIKA ENTERPRISE', 'other', null, null, 'Kolkata', '700016 · West Bengal'),
  ('RITRAS FASHION DESIGNER STUDIO', 'other', '+919831787026', null, 'Kolkata', '700016 · West Bengal'),
  ('ROOP RANG FASHION PRIVATE LIMITED', 'other', '+919831007971', null, 'Kolkata', 'Park Street · 700016 · West Bengal'),
  ('ROSHANS SAREE PALACE PRIVATE LIMITED', 'other', null, null, 'Delhi', '110005 · Delhi'),
  ('SAHELI FASHIONS PRIVATE LIMITED', 'other', null, null, 'Mumbai', 'Dadar West · 400028 · Maharashtra'),
  ('SHUBHANDAM', 'other', null, null, 'Jaipur', '302003 · Rajasthan · dummy number 1234567890 in old software — get the real one'),
  ('SONA AGRAWAL', 'other', '+919831627654', null, 'Kolkata', '700038 · West Bengal'),
  ('STUDIO AMAS', 'other', '+918700496602', null, 'Delhi', 'Okhla Industrial Area · 110020 · Delhi'),
  ('SUMAN SELECTION', 'other', '+919874045670', null, 'Kolkata', '700016 · West Bengal'),
  ('SUMAN''S LABEL', 'other', null, null, 'Kolkata', '700020 · West Bengal'),
  ('TANKHI DESIGNS1 PRIVATE LTD', 'other', '+918369452674', null, 'Mumbai', 'Goregaon East · 400063 · Maharashtra'),
  ('TANSHI FASHIONS PRIVATE LIMITED', 'other', null, null, 'Kolkata', 'Park Street · 700016 · West Bengal'),
  ('THAKUR EXCLUSIVE', 'other', null, null, 'Delhi', 'Delhi'),
  ('THE MERAKI STUDIO', 'other', '+917891099995', null, 'Mumbai', '400028 · Maharashtra'),
  ('UK CREATION', 'other', null, null, null, 'West Bengal'),
  ('USHA BAGRI', 'other', null, null, null, 'West Bengal'),
  ('VALRAH FASHION HOUSE', 'other', '+919619611187', null, 'Mumbai', '400028 · Maharashtra'),
  ('VANNIKAA MALIK', 'other', null, null, 'Delhi', '110028 · Delhi')
) as v(name, category, phone, email, city, notes)
where not exists (select 1 from vendors x where lower(x.name) = lower(v.name));

-- 60 vendors. Afterwards: select name, city, phone from vendors order by name;
