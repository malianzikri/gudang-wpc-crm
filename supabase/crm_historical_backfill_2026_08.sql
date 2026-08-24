-- CRM Attribution V3 - HISTORICAL BACKFILL
-- Generated from Template_Lead_WPC_PVC_Custom_Audience_Meta_REVISI(2).xlsx
-- 145 unique historical WhatsApp numbers.
--
-- IMPORTANT:
-- 1) Run crm_attribution_v3_patch.sql first.
-- 2) Deploy the V3 app.
-- 3) Run THIS file once.
--
-- Behavior:
-- - Matches by wa_id/phone; it does NOT create duplicates for numbers already in CRM.
-- - Corrects first-touch source using the manual history.
-- - Broadcast-only historical rows become 'Legacy / Belum Teratribusi' first-touch
--   with 'WhatsApp Broadcast' as marketing touch.
-- - Historical rows are CAPI-suppressed unless a valid live CTWA click already exists.
-- - Current/live last activity is preserved.
-- - Status is only promoted when the historical status is further in the funnel.
-- - Yuni revenue is corrected to Rp10.500.000; explicit manual revenues for
--   Djomazon (Rp1.400.000) and Dede (Rp375.000) are also included.
--
-- This script is idempotent and safe to rerun.

begin;

with historical(
  wa_id,phone,name,status,source,last_touch_source,first_seen_at,last_seen_at,revenue,manual_campaign,campaign_name,adset_name,ad_name,source_confidence,notes
) as (
  values
  ('6282183992031','+6282183992031','Widodo','Qualified','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-04-12T12:00:00+07:00','2026-04-12T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','Cari Outdoor, rekomendasi indoor masih tanya tuan rumah'),
  ('6281271615489','+6281271615489','Eletrical','Tanya Kebutuhan','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-07-07T12:00:00+07:00','2026-07-07T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','nanya PVC Pink'),
  ('6282370292345','+6282370292345','Indra','Closing','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-07-07T12:00:00+07:00','2026-07-07T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','dibroadcast sampe di survey akhirnya deal'),
  ('628985959418','+628985959418','sulaiman','Closing','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-07-08T12:00:00+07:00','2026-07-08T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','Follow up terus akhirnya closing'),
  ('6285378844500','+6285378844500','andisha','Tanya Kebutuhan','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-07-20T12:00:00+07:00','2026-07-20T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','Nanya pengiriman '),
  ('6282219518241','+6282219518241','Plafon Molding','Qualified','Meta Ads','Meta Ads','2026-08-03T12:00:00+07:00','2026-08-03T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta','Jarak Kejauhan'),
  ('6281272653615','+6281272653615','Yenny','Closing','Meta Ads','Meta Ads','2026-08-04T12:00:00+07:00','2026-08-04T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6283153071975','+6283153071975','Rehan','Qualified','Meta Ads','Meta Ads','2026-08-04T12:00:00+07:00','2026-08-04T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta','Cari Plain Lantai'),
  ('6282175359440','+6282175359440','Adie','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-04T12:00:00+07:00','2026-08-04T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta','Cari Merk Sunda Plafon'),
  ('6282176766748','+6282176766748','Alkeny','Qualified','Meta Ads','Meta Ads','2026-08-04T12:00:00+07:00','2026-08-04T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281369986411','+6281369986411','alfatih','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-04T12:00:00+07:00','2026-08-04T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta','gak ada kabar lagi dari dikirim quotation'),
  ('6282260956844','+6282260956844','Bagus','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-04T12:00:00+07:00','2026-08-04T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta','gak ada kabar lagi dari dikirim quotation'),
  ('6281273465425','+6281273465425','grosirselempang','Qualified','Meta Ads','Meta Ads','2026-08-04T12:00:00+07:00','2026-08-04T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Nanya kebutuhan sudahnya ilang'),
  ('6283845962354','+6283845962354','Ston','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-05T12:00:00+07:00','2026-08-05T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282376619495','+6282376619495','toyeb','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-05T12:00:00+07:00','2026-08-05T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','nanya lokasi sudahnya putus'),
  ('6281377551178','+6281377551178','Harbani','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-05T12:00:00+07:00','2026-08-05T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Nanya Panjang Keping aja'),
  ('628127100995','+628127100995','Hasbullah','Hot','Meta Ads','Meta Ads','2026-08-05T12:00:00+07:00','2026-08-05T12:00:00+07:00',0,'D3',NULL,NULL,NULL,'historical_manual_meta','Masih tgg hitungan tukang dulu'),
  ('6281272484730','+6281272484730','Anjas mc','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281273130008','+6281273130008','Marina','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281278343622','+6281278343622','Tantri','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282178236825','+6282178236825','Amin','Chat Builder','Meta Ads','Meta Ads','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282282150304','+6282282150304','Irwansyah','Qualified','Meta Ads','Meta Ads','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta','Cari Wall Mounding'),
  ('6282258749803','+6282258749803','Sugeng','Chat Builder','Meta Ads','Meta Ads','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282180109496','+6282180109496','bismi','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282139389090','+6282139389090',NULL,'Chat Builder','Meta Ads','Meta Ads','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6285273080606','+6285273080606','Hani','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Nanya udah termasuk pasang belum'),
  ('6282322282899','+6282322282899','Lani','Qualified','Meta Ads','Meta Ads','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('628117891292','+628117891292','Rani','Qualified','WhatsApp Organic','WhatsApp Organic','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'Organic',NULL,NULL,NULL,'historical_manual_organic','udah dikasih harga '),
  ('628974457520','+628974457520','Ferlian','Tanya Kebutuhan','WhatsApp Organic','WhatsApp Organic','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'Organic',NULL,NULL,NULL,'historical_manual_organic','Dikasih Harga tapi gak jadi nanya'),
  ('6287774476061','+6287774476061','Tata','Hot','Meta Ads','Meta Ads','2026-08-06T12:00:00+07:00','2026-08-06T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','masih diskusi sama suaminya'),
  ('6281373394381','+6281373394381','Al Mursal','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-07T12:00:00+07:00','2026-08-07T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','nanya lokasi sudahnya putus'),
  ('628976698827','+628976698827','Maharudin Nasution','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-07T12:00:00+07:00','2026-08-07T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Nanya harga'),
  ('6282175445008','+6282175445008','Faris Irawan','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-07T12:00:00+07:00','2026-08-07T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Dikasih Harga permeter udahnya kabur'),
  ('6285383364712','+6285383364712','y','Hot','Meta Ads','Meta Ads','2026-08-07T12:00:00+07:00','2026-08-07T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Daerah Diluar Palembang'),
  ('6282176863206','+6282176863206','sadi','Chat Builder','Meta Ads','Meta Ads','2026-08-07T12:00:00+07:00','2026-08-07T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6285363990468','+6285363990468','hendra','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-07T12:00:00+07:00','2026-08-07T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Nany motif sudahnya kabur'),
  ('6285180543574','+6285180543574','Alamsyah','Chat Builder','Meta Ads','Meta Ads','2026-08-07T12:00:00+07:00','2026-08-07T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281273717022','+6281273717022','Firdaus Amin','Chat Builder','Meta Ads','Meta Ads','2026-08-07T12:00:00+07:00','2026-08-07T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281368771985','+6281368771985','bg2005zls','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-07T12:00:00+07:00','2026-08-07T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','gak ada kabar lagi dari dikirim quotation'),
  ('6282322965144','+6282322965144','Alam','Qualified','Meta Ads','Meta Ads','2026-08-07T12:00:00+07:00','2026-08-07T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','nanya sampe ada list dikasih motif yang ada list stop'),
  ('6281367342708','+6281367342708','Imelda','Chat Builder','Meta Ads','Meta Ads','2026-08-08T12:00:00+07:00','2026-08-08T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('628117321082','+628117321082','PRc Rent','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-08T12:00:00+07:00','2026-08-08T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Nanya lokasi sudahnya gak jadi kelokasi'),
  ('6285267628773','+6285267628773','Linpatralisda','Hot','Meta Ads','Meta Ads','2026-08-08T12:00:00+07:00','2026-08-08T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Nunggu renovasi selesai'),
  ('6281368140666','+6281368140666','Evilioem','Chat Builder','Meta Ads','Meta Ads','2026-08-08T12:00:00+07:00','2026-08-08T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281367509855','+6281367509855','Asmadi','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-08T12:00:00+07:00','2026-08-08T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Nanya motif '),
  ('628194805305','+628194805305','Feri Arsita','Closing','Meta Ads','Meta Ads','2026-08-08T12:00:00+07:00','2026-08-08T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282295099998','+6282295099998','Ardy Hokky','Chat Builder','Meta Ads','Meta Ads','2026-08-09T12:00:00+07:00','2026-08-09T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281271445586','+6281271445586','INTdedy','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-09T12:00:00+07:00','2026-08-09T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Nanya Pu Stone'),
  ('628127137321','+628127137321','Irwan K','Hot','Meta Ads','Meta Ads','2026-08-09T12:00:00+07:00','2026-08-09T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Nunggu renovasi selesai'),
  ('6282281529558','+6282281529558','Ahmad','Tanya Kebutuhan','WhatsApp Organic','WhatsApp Organic','2026-08-09T12:00:00+07:00','2026-08-09T12:00:00+07:00',0,'Organic',NULL,NULL,NULL,'historical_manual_organic','Nanya Lokasi'),
  ('6288269912138','+6288269912138','Dhea','Qualified','Meta Ads','Meta Ads','2026-08-09T12:00:00+07:00','2026-08-09T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Belum ada uangnya tapi berminat'),
  ('6282187054377','+6282187054377','Perfendi','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-09T12:00:00+07:00','2026-08-09T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Nanya Vinil'),
  ('6285267126622','+6285267126622','Marpensi','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-09T12:00:00+07:00','2026-08-09T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','ada minat tapi tanya" aja'),
  ('6283181983326','+6283181983326','Risma','Chat Builder','Meta Ads','Meta Ads','2026-08-09T12:00:00+07:00','2026-08-09T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282171188833','+6282171188833','Papa Aulia','Qualified','Meta Ads','Meta Ads','2026-08-09T12:00:00+07:00','2026-08-09T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','mau liat lokasi '),
  ('628787768168','+628787768168','Halianto','Qualified','Meta Ads','Meta Ads','2026-08-09T12:00:00+07:00','2026-08-09T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282179909574','+6282179909574','Herman','Chat Builder','Meta Ads','Meta Ads','2026-08-10T12:00:00+07:00','2026-08-10T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281377573382','+6281377573382','zulpakarbawaihi','Qualified','Meta Ads','Meta Ads','2026-08-10T12:00:00+07:00','2026-08-10T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','dikasih tau kebutuhan terus ilang'),
  ('6285839003685','+6285839003685','desi','Chat Builder','Meta Ads','Meta Ads','2026-08-10T12:00:00+07:00','2026-08-10T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281379663579','+6281379663579',NULL,'Chat Builder','Meta Ads','Meta Ads','2026-08-10T12:00:00+07:00','2026-08-10T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281377542088','+6281377542088','Januari','Qualified','Meta Ads','Meta Ads','2026-08-10T12:00:00+07:00','2026-08-10T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6285378151915','+6285378151915','Anisyah','Qualified','WhatsApp Organic','WhatsApp Organic','2026-08-10T12:00:00+07:00','2026-08-10T12:00:00+07:00',0,'Organic',NULL,NULL,NULL,'historical_manual_organic',NULL),
  ('6282280908311','+6282280908311','The king','Hot','Meta Ads','Meta Ads','2026-08-10T12:00:00+07:00','2026-08-10T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Konfirmasi pemesanan, terus ilang'),
  ('6281391858118','+6281391858118','zaifahifah','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-10T12:00:00+07:00','2026-08-10T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','belum tau ukuran '),
  ('6285297991071','+6285297991071','muhyidin','Qualified','Meta Ads','Meta Ads','2026-08-10T12:00:00+07:00','2026-08-10T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Kemahalan katanya'),
  ('6281377546078','+6281377546078','plafon pvc interior','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-10T12:00:00+07:00','2026-08-10T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','diluar kota'),
  ('6281369753646','+6281369753646','regi','Qualified','Meta Ads','Meta Ads','2026-08-10T12:00:00+07:00','2026-08-10T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','belum kelokasi nanti diinfo'),
  ('6285783777939','+6285783777939','petrus','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','dikasih katalog harga sudahnya gak ada balasan'),
  ('6281363253730','+6281363253730','Hadi','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','Tanya barang yang gak ada'),
  ('6285669070085','+6285669070085','zaza','Chat Builder','Meta Ads','Meta Ads','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('628886900103','+628886900103','Suro liman','Chat Builder','Meta Ads','Meta Ads','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6289606543185','+6289606543185','sary','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282180048300','+6282180048300','Heriyadi','Qualified','WhatsApp Organic','WhatsApp Organic','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'Organic',NULL,NULL,NULL,'historical_manual_organic','masih ngumpulin dana dl'),
  ('628127699969','+628127699969','nandar','Chat Builder','Meta Ads','Meta Ads','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6283159494521','+6283159494521','ikhsan','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','nanya harga reseller'),
  ('6281278159684','+6281278159684','Maulana','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','tanya lokasi gudang dari muara enim'),
  ('62895604673130','+62895604673130','Rini','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','kasih katalog ilang'),
  ('628126771216','+628126771216','Leonardo','Chat Builder','Meta Ads','Meta Ads','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282181896524','+6282181896524','al kautsar','Chat Builder','Meta Ads','Meta Ads','2026-08-11T12:00:00+07:00','2026-08-11T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('62811784097','+62811784097','Fuad','Hot','Meta Ads','Meta Ads','2026-08-12T12:00:00+07:00','2026-08-12T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','minta Survey sabtu nanti'),
  ('6281933377969','+6281933377969','Janto','Chat Builder','Meta Ads','Meta Ads','2026-08-12T12:00:00+07:00','2026-08-12T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282279820060','+6282279820060','Sugeng','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-12T12:00:00+07:00','2026-08-12T12:00:00+07:00',0,'D2',NULL,NULL,NULL,'historical_manual_meta','nanya di lahat ada gak'),
  ('6281274233325','+6281274233325','dhonnie','Hot','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-08-12T12:00:00+07:00','2026-08-12T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','Udah dilempar quotation , tinggal mikir" dl'),
  ('6281368008723','+6281368008723',NULL,'Qualified','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-08-12T12:00:00+07:00','2026-08-12T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','Mau Beli bahan aja tapi minta dipotongi'),
  ('6285758531388','+6285758531388','Bunda Bilqis','Tanya Kebutuhan','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-08-12T12:00:00+07:00','2026-08-12T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','Minat beli tapi posisi dipulau rimau diluar palembang'),
  ('6282268775067','+6282268775067','Erike','Tanya Kebutuhan','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-08-12T12:00:00+07:00','2026-08-12T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','Nanya" motif, ukuran dan harga 1 dus, ternyata posisi lubuk linggau gak dipalembang'),
  ('6283876768000','+6283876768000','M.Rafi Alfarizi','Qualified','Meta Ads','Meta Ads','2026-08-13T12:00:00+07:00','2026-08-13T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','Minat tapi hanya 4 keping dan gak mau jadinya'),
  ('6282177991985','+6282177991985','rantiambarkusmira1985','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-13T12:00:00+07:00','2026-08-13T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','Nanya lokasi'),
  ('6281271893228','+6281271893228',NULL,'Chat Builder','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D4',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281367050484','+6281367050484','Eka Yulianti','Hot','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','udah minta perhitungan tinggal dikejer agar deal'),
  ('6285357724451','+6285357724451',NULL,'Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D5',NULL,NULL,NULL,'historical_manual_meta','Udah kasih luas ruangan, dah dikasih harga tinggal dikejer'),
  ('6282281167823','+6282281167823','Ria Paristha','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','nanya motif kayu'),
  ('628127829431','+628127829431','Ban Hong','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','Masih pikir pake wpc,pvc,wallboard'),
  ('6282281684284','+6282281684284','Reni','Chat Builder','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D4',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282281469581','+6282281469581','Kamaludin','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6285123302748','+6285123302748','kelanajaya604','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D4',NULL,NULL,NULL,'historical_manual_meta','dikasih quotation terus ngilang'),
  ('6288272191102','+6288272191102','Andrean Saputra','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','Minta Harga wallboard dikasih ilang'),
  ('6285783373090','+6285783373090','Vera','Qualified','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','Masih mau ukur dl berapa kebutuhan'),
  ('6285768521974','+6285768521974','Antonio','Chat Builder','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6282176653189','+6282176653189','Ecoo','Qualified','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','Besok dikabari kebutuhannya'),
  ('628127330033','+628127330033','Anna','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282181421839','+6282181421839','Ida','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','nanya motif bambu'),
  ('6282225868346','+6282225868346','Eni','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-14T12:00:00+07:00','2026-08-14T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','Diluar daerah palembang'),
  ('6283198781182','+6283198781182',NULL,'Chat Builder','Meta Ads','Meta Ads','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6285373012262','+6285373012262','suratman','Chat Builder','Meta Ads','Meta Ads','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6282159154203','+6282159154203',NULL,'Chat Builder','Meta Ads','Meta Ads','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6288268154953','+6288268154953','astoni','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6282126756490','+6282126756490','Hendry','Chat Builder','Meta Ads','Meta Ads','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('628127857004','+628127857004','Linda','Qualified','Meta Ads','Meta Ads','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'D4',NULL,NULL,NULL,'historical_manual_meta','lokasinya kejauhan dan minta potong 1 meter kalau bisa'),
  ('6281366102336','+6281366102336','Triany','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','nyari pvc quotation dikirim tapi no response'),
  ('6281264612051','+6281264612051','edy','Chat Builder','Meta Ads','Meta Ads','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6282280635949','+6282280635949','mama chewie','Estimasi Dikirim','Walk-in','Walk-in','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'Organic',NULL,NULL,NULL,'historical_manual_walkin','nanya ongkos pasang'),
  ('6281272700085','+6281272700085','Ryan','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'D4',NULL,NULL,NULL,'historical_manual_meta','Quotation dikiirm , masih blm ada keputusan'),
  ('6285832976501','+6285832976501',NULL,'Tanya Kebutuhan','Referral','Referral','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'Organic',NULL,NULL,NULL,'historical_manual_referral','Nanya Wallboard'),
  ('6285609089834','+6285609089834',NULL,'Chat Builder','Meta Ads','Meta Ads','2026-08-15T12:00:00+07:00','2026-08-15T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('62811787900','+62811787900','ar','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-16T12:00:00+07:00','2026-08-16T12:00:00+07:00',0,'Organic',NULL,NULL,NULL,'historical_manual_meta','nanya wpc outdoor direkomendasiin harga , terus dikasih opsi wpc indoor '),
  ('6285279905730','+6285279905730',NULL,'Chat Builder','Meta Ads','Meta Ads','2026-08-16T12:00:00+07:00','2026-08-16T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6282177111128','+6282177111128','t','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-16T12:00:00+07:00','2026-08-16T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','Quotation dikirim'),
  ('6281179767385','+6281179767385',NULL,'Chat Builder','Meta Ads','Meta Ads','2026-08-16T12:00:00+07:00','2026-08-16T12:00:00+07:00',0,'D4',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6282185700666','+6282185700666','gan chew','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-16T12:00:00+07:00','2026-08-16T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','Daerahnya diluar palembang'),
  ('6282177569980','+6282177569980','Jay','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-16T12:00:00+07:00','2026-08-16T12:00:00+07:00',0,'Organic',NULL,NULL,NULL,'historical_manual_meta','Daerah Diluar Palembang'),
  ('628127117875','+628127117875','Ahmad Azhari','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-16T12:00:00+07:00','2026-08-16T12:00:00+07:00',0,'D4',NULL,NULL,NULL,'historical_manual_meta',NULL),
  ('6281314695353','+6281314695353','iril','Chat Builder','Meta Ads','Meta Ads','2026-08-17T12:00:00+07:00','2026-08-17T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('628984419518','+628984419518','Yunita','Chat Builder','Meta Ads','Meta Ads','2026-08-17T12:00:00+07:00','2026-08-17T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6281380263380','+6281380263380','Hadi','Chat Builder','Meta Ads','Meta Ads','2026-08-17T12:00:00+07:00','2026-08-17T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6281271541209','+6281271541209',NULL,'Chat Builder','Meta Ads','Meta Ads','2026-08-17T12:00:00+07:00','2026-08-17T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','nanya pintu kusen upvc'),
  ('6283134064554','+6283134064554','dwsl','Estimasi Dikirim','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-08-17T12:00:00+07:00','2026-08-17T12:00:00+07:00',0,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','udah dikasih harga no answer'),
  ('6285382327659','+6285382327659',NULL,'Chat Builder','Meta Ads','Meta Ads','2026-08-17T12:00:00+07:00','2026-08-17T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','Lokasi diluar palembang'),
  ('628974419469','+628974419469','M Deni','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-17T12:00:00+07:00','2026-08-17T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','udah dikasih , nanti dihubungi lagi'),
  ('62811780365','+62811780365','Yusufran','Chat Builder','Meta Ads','Meta Ads','2026-08-17T12:00:00+07:00','2026-08-17T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','nanya WPC untuk lantai deck atau mezanine'),
  ('6282179799226','+6282179799226','MH','Chat Builder','Meta Ads','Meta Ads','2026-08-17T12:00:00+07:00','2026-08-17T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6281273138322','+6281273138322','A Yusuf','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-17T12:00:00+07:00','2026-08-17T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','udah dikasih harga no answer'),
  ('6281271464063','+6281271464063','suharjo','Chat Builder','Meta Ads','Meta Ads','2026-08-18T12:00:00+07:00','2026-08-18T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6281377757300','+6281377757300','Faizatunisa','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-18T12:00:00+07:00','2026-08-18T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6283894511070','+6283894511070',NULL,'Chat Builder','Meta Ads','Meta Ads','2026-08-18T12:00:00+07:00','2026-08-18T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6282186683095','+6282186683095','rina','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-18T12:00:00+07:00','2026-08-18T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6281278914655','+6281278914655','latief','Chat Builder','Meta Ads','Meta Ads','2026-08-18T12:00:00+07:00','2026-08-18T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta',NULL),
  ('6289524845673','+6289524845673','Yuni','Closing','Meta Ads','Meta Ads','2026-08-18T12:00:00+07:00','2026-08-18T12:00:00+07:00',10500000,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','di survey terus deal sampe beli total transaksi 10,5 juta'),
  ('6281367670500','+6281367670500','Djomazon','Closing','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-08-18T12:00:00+07:00','2026-08-18T12:00:00+07:00',1400000,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','Beli wpc 20 keping transaksi 1,4 juta'),
  ('6282280303132','+6282280303132','fieetree','Qualified','Meta Ads','Meta Ads','2026-08-19T12:00:00+07:00','2026-08-19T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','tinggal nunggu ukuran '),
  ('6282377999667','+6282377999667','thoriqus','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-19T12:00:00+07:00','2026-08-19T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','nanya uv marble tapi harganya gak masuk'),
  ('6282111497057','+6282111497057','Dede','Closing','Legacy / Belum Teratribusi','WhatsApp Broadcast','2026-08-19T12:00:00+07:00','2026-08-19T12:00:00+07:00',375000,'Broadcast',NULL,NULL,NULL,'historical_manual_broadcast_unknown_origin','Repeat order beli 5 keping , transaksi 375 ribu'),
  ('6281271525745','+6281271525745','Ra Fenty','Estimasi Dikirim','Meta Ads','Meta Ads','2026-08-19T12:00:00+07:00','2026-08-19T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','nanya harga sama jasa pasang lokasi sako dikirim motif belum ada kabar'),
  ('6285355884688','+6285355884688','Bengkel las kelapa','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-19T12:00:00+07:00','2026-08-19T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','Nanya motif kanopi plafon'),
  ('6281373579698','+6281373579698','Lagi kerja','Tanya Kebutuhan','Meta Ads','Meta Ads','2026-08-19T12:00:00+07:00','2026-08-19T12:00:00+07:00',0,'D2 New','LEADS | WA | WPC PVC | PLG | D2 | 13AUG26','WA | BROAD PLG | 23-60 | D2','D2 | WPC FOCUS | KIRIM UKURAN','historical_manual_meta','nanya motif harga lokasi')
)
insert into public.leads as l (
  wa_id,
  phone,
  name,
  status,
  source,
  last_touch_source,
  last_touch_at,
  first_seen_at,
  last_seen_at,
  revenue,
  manual_campaign,
  campaign_name,
  adset_name,
  ad_name,
  source_confidence,
  is_historical,
  historical_imported_at,
  suppress_capi,
  notes
)
select
  h.wa_id,
  h.phone,
  h.name,
  h.status,
  h.source,
  h.last_touch_source,
  h.last_seen_at::timestamptz,
  h.first_seen_at::timestamptz,
  h.last_seen_at::timestamptz,
  h.revenue::numeric,
  h.manual_campaign,
  h.campaign_name,
  h.adset_name,
  h.ad_name,
  h.source_confidence,
  true,
  now(),
  true,
  case when h.notes is null then null else '[Historical] ' || h.notes end
from historical h
on conflict (wa_id) do update
set
  phone = coalesce(l.phone, excluded.phone),
  name = case
    when l.name is null or btrim(l.name) = '' then excluded.name
    else l.name
  end,

  -- Earlier manual date becomes the real first touch.
  first_seen_at = least(l.first_seen_at, excluded.first_seen_at),
  last_seen_at = greatest(l.last_seen_at, excluded.last_seen_at),

  -- Source precedence:
  -- direct/known Meta history fixes false Organic;
  -- known Walk-in/Referral/Organic also fix false Organic;
  -- broadcast-only legacy records are NOT called Organic.
  source = case
    when l.source = 'Meta Ads' then 'Meta Ads'
    when excluded.source = 'Meta Ads' then 'Meta Ads'
    when l.source in ('Walk-in','Referral') then l.source
    when excluded.source in ('Walk-in','Referral') then excluded.source
    when excluded.source = 'Legacy / Belum Teratribusi'
         and l.source in ('WhatsApp Organic','Organic') then excluded.source
    when excluded.source = 'WhatsApp Organic'
         and l.source in ('WhatsApp Organic','Organic','Legacy / Belum Teratribusi') then excluded.source
    else l.source
  end,

  source_confidence = case
    when excluded.source = 'Meta Ads' and l.source <> 'Meta Ads'
      then excluded.source_confidence
    when excluded.source = 'Legacy / Belum Teratribusi'
         and l.source in ('WhatsApp Organic','Organic')
      then excluded.source_confidence
    when l.source_confidence is null
      then excluded.source_confidence
    else l.source_confidence
  end,

  -- Broadcast is a marketing reactivation, not first-touch acquisition.
  last_touch_source = case
    when excluded.last_touch_source = 'WhatsApp Broadcast'
      then 'WhatsApp Broadcast'
    else coalesce(l.last_touch_source, excluded.last_touch_source)
  end,
  last_touch_at = greatest(
    coalesce(l.last_touch_at, l.last_seen_at),
    excluded.last_touch_at
  ),

  manual_campaign = coalesce(l.manual_campaign, excluded.manual_campaign),

  -- Exact current D2 names are filled only when the live row has no richer Meta data.
  campaign_name = coalesce(l.campaign_name, excluded.campaign_name),
  adset_name = coalesce(l.adset_name, excluded.adset_name),
  ad_name = coalesce(l.ad_name, excluded.ad_name),

  status = case
    when (case excluded.status
      when 'Chat Builder' then 0
      when 'Tanya Kebutuhan' then 1
      when 'Estimasi Dikirim' then 2
      when 'Foto Area Diterima' then 3
      when 'Qualified' then 4
      when 'Survey Ditawarkan' then 5
      when 'Survey Terjadwal' then 6
      when 'Quotation Final' then 7
      when 'Hot' then 8
      when 'Closing' then 9
      when 'Tidak Layak' then 10
      else -1 end) >
         (case l.status
      when 'Chat Builder' then 0
      when 'Tanya Kebutuhan' then 1
      when 'Estimasi Dikirim' then 2
      when 'Foto Area Diterima' then 3
      when 'Qualified' then 4
      when 'Survey Ditawarkan' then 5
      when 'Survey Terjadwal' then 6
      when 'Quotation Final' then 7
      when 'Hot' then 8
      when 'Closing' then 9
      when 'Tidak Layak' then 10
      else -1 end)
      then excluded.status
    else l.status
  end,

  revenue = greatest(l.revenue, excluded.revenue),

  is_historical = true,
  historical_imported_at = coalesce(l.historical_imported_at, now()),

  -- Historical-only records must never fire old CAPI events.
  -- If a live row already has a CTWA click, preserve its current suppression flag.
  suppress_capi = case
    when l.ctwa_clid is not null then l.suppress_capi
    else true
  end,

  notes = case
    when excluded.notes is null then l.notes
    when l.notes is null or btrim(l.notes) = '' then excluded.notes
    when position(excluded.notes in l.notes) > 0 then l.notes
    else l.notes || E'\n' || excluded.notes
  end;

commit;

-- Verification queries (read-only)
select
  count(*) as total_leads,
  count(*) filter (where is_historical) as historical_leads,
  count(*) filter (where source = 'Meta Ads') as meta_first_touch,
  count(*) filter (where source = 'WhatsApp Organic') as organic_first_touch,
  count(*) filter (where source = 'Legacy / Belum Teratribusi') as legacy_unattributed,
  count(*) filter (where last_touch_source = 'WhatsApp Broadcast') as broadcast_reactivated
from public.leads;

select
  name, phone, source, manual_campaign, campaign_name, status, revenue,
  first_seen_at, last_seen_at, last_touch_source, suppress_capi
from public.leads
where wa_id in ('6289524845673','6281271541209','6281367670500')
order by name;
