/* What the Book of Truth says about its own models and fields.
   The semantic layer hands the desk names, labels and types, not prose, so the
   explorer's Description column is written here. Fields are listed only where
   the name alone would not tell a newcomer to the underworld what they mean. */
window.NetherNotes=(()=>{
 const models={
  nether_person:'Every soul in the realm: who they were, where they were born, when they died and which gate awaits them.',
  nether_relationship:'A bond between two souls, such as a marriage, with the dates it held.',
  nether_passage_permit:'The permit a soul carries to cross the river, with its seal and validity.',
  nether_asset:'Something that could be owned in life: a field, a house, a boat.',
  nether_ownership_transaction:'One change of hands of an asset, with seller, buyer, date and price.',
  nether_library:'A hall that lends books, in a region.',
  nether_library_card:'A soul’s standing to borrow at one library, from when it was issued to when, if ever, it was revoked.',
  nether_book:'A title: who wrote it and what it concerns.',
  nether_book_copy:'One physical copy of a book, shelved at a library. A book may have copies at several libraries.',
  nether_borrowing_record:'One card, one copy, one loan: when it left and when, if ever, it came back.',
  nether_business:'A workshop, farm or house of trade that employed people.',
  nether_employment:'A soul working a role, optionally for a business. Self-employed souls have no business.',
  nether_ailment:'A sickness a healer might face, ranked by how grave it is.',
  nether_patient_case:'One patient seen by one healer for one ailment, and how it ended.',
  nether_campaign:'A war the realm fought, with its region and span of years.',
  nether_service:'A soul serving in a campaign, with their rank and the dates they served.',
  nether_casualty_record:'A killing: who killed whom, in which campaign, and whether it happened in battle or outside it.',
  nether_estate:'A tract of farmland, measured in hectares.',
  nether_holding:'A soul holding an estate for a span of time.',
  nether_harvest_record:'What an estate yielded of a crop in a given season.',
  nether_temple:'A temple dedicated to a deity.',
  nether_offering:'A gift a soul made at a temple.',
  nether_oath:'A promise sworn by a soul, and whether it was kept.',
 };
 const fields={
  'nether_person.gate':'The gate of the afterlife this soul is bound for.',
  'nether_person.death_date':'The day the soul crossed over.',
  'nether_person.identity_id':'The declaration’s unique eight-character identity number, written as XXXX-XXXX.',
  'nether_person.issue_place':'The office that issued this identity declaration. Check the country’s offices in the instruction book’s map.',
  'nether_obol_standard.issue_location_1':'An authorised identity office in this country.',
  'nether_obol_standard.issue_location_2':'An authorised identity office in this country.',
  'nether_obol_standard.issue_location_3':'An authorised identity office in this country.',
  'nether_relationship.bond_type':'The kind of bond between the two souls, such as spouse.',
  'nether_relationship.bonded_to':'When the bond ended. Text rather than a date, as the bond may still hold.',
  'nether_passage_permit.seal':'The judge’s seal stamped on the permit.',
  'nether_passage_permit.status':'The permit’s current standing.',
  'nether_ownership_transaction.seller_person_id':'Empty when the asset was first acquired rather than bought from someone.',
  'nether_ownership_transaction.price':'What the buyer paid, in the realm’s coin.',
  'nether_asset.asset_type':'The kind of asset: field, house, boat.',
  'nether_library_card.revoked_on':'Empty while the card is still valid.',
  'nether_book_copy.library_id':'Where this particular copy is shelved, which may differ from the library that issued the borrower’s card.',
  'nether_borrowing_record.returned_on':'Empty while the book is still out.',
  'nether_employment.business_id':'Empty for the self-employed, such as musicians and poets.',
  'nether_employment.role':'What the soul did there.',
  'nether_ailment.severity':'How grave the sickness is. Higher is worse.',
  'nether_patient_case.healer_person_id':'The soul who treated the patient.',
  'nether_patient_case.patient_person_id':'The soul who was treated.',
  'nether_patient_case.outcome':'Whether the patient recovered.',
  'nether_patient_case.fee':'What the healer was paid.',
  'nether_service.rank':'The soldier’s rank in that campaign.',
  'nether_casualty_record.killer_person_id':'The soul who dealt the killing blow.',
  'nether_casualty_record.victim_person_id':'The soul who died.',
  'nether_casualty_record.campaign_id':'Empty when the killing happened outside a campaign.',
  'nether_casualty_record.context':'Whether the death happened in battle or outside it.',
  'nether_harvest_record.yield_measure':'The size of the harvest, in measures of grain.',
  'nether_oath.kept':'False if the soul broke their word.',
  'nether_offering.value':'The worth of the gift.',
 };
 // Generated from the actual dimension definitions in models/nether*.model.aml.
 const fieldDefinitions={
 "nether_ailment.ailment_id": {
  "type": "text",
  "definition": "{{ #SOURCE.ailment_id }}"
 },
 "nether_ailment.name": {
  "type": "text",
  "definition": "{{ #SOURCE.name }}"
 },
 "nether_ailment.severity": {
  "type": "number",
  "definition": "{{ #SOURCE.severity }}"
 },
 "nether_asset.asset_id": {
  "type": "text",
  "definition": "{{ #SOURCE.asset_id }}"
 },
 "nether_asset.asset_type": {
  "type": "text",
  "definition": "{{ #SOURCE.asset_type }}"
 },
 "nether_asset.name": {
  "type": "text",
  "definition": "{{ #SOURCE.name }}"
 },
 "nether_asset.location": {
  "type": "text",
  "definition": "{{ #SOURCE.location }}"
 },
 "nether_book.book_id": {
  "type": "text",
  "definition": "{{ #SOURCE.book_id }}"
 },
 "nether_book.title": {
  "type": "text",
  "definition": "{{ #SOURCE.title }}"
 },
 "nether_book.author": {
  "type": "text",
  "definition": "{{ #SOURCE.author }}"
 },
 "nether_book.subject": {
  "type": "text",
  "definition": "{{ #SOURCE.subject }}"
 },
 "nether_book_copy.copy_id": {
  "type": "text",
  "definition": "{{ #SOURCE.copy_id }}"
 },
 "nether_book_copy.book_id": {
  "type": "text",
  "definition": "{{ #SOURCE.book_id }}"
 },
 "nether_book_copy.library_id": {
  "type": "text",
  "definition": "{{ #SOURCE.library_id }}"
 },
 "nether_borrowing_record.borrow_id": {
  "type": "text",
  "definition": "{{ #SOURCE.borrow_id }}"
 },
 "nether_borrowing_record.card_id": {
  "type": "text",
  "definition": "{{ #SOURCE.card_id }}"
 },
 "nether_borrowing_record.copy_id": {
  "type": "text",
  "definition": "{{ #SOURCE.copy_id }}"
 },
 "nether_borrowing_record.borrowed_on": {
  "type": "date",
  "definition": "{{ #SOURCE.borrowed_on }}"
 },
 "nether_borrowing_record.returned_on": {
  "type": "date",
  "definition": "{{ #SOURCE.returned_on }}"
 },
 "nether_business.business_id": {
  "type": "text",
  "definition": "{{ #SOURCE.business_id }}"
 },
 "nether_business.name": {
  "type": "text",
  "definition": "{{ #SOURCE.name }}"
 },
 "nether_business.trade": {
  "type": "text",
  "definition": "{{ #SOURCE.trade }}"
 },
 "nether_business.location": {
  "type": "text",
  "definition": "{{ #SOURCE.location }}"
 },
 "nether_campaign.campaign_id": {
  "type": "text",
  "definition": "{{ #SOURCE.campaign_id }}"
 },
 "nether_campaign.name": {
  "type": "text",
  "definition": "{{ #SOURCE.name }}"
 },
 "nether_campaign.started_on": {
  "type": "date",
  "definition": "{{ #SOURCE.started_on }}"
 },
 "nether_campaign.ended_on": {
  "type": "date",
  "definition": "{{ #SOURCE.ended_on }}"
 },
 "nether_campaign.region": {
  "type": "text",
  "definition": "{{ #SOURCE.region }}"
 },
 "nether_casualty_record.casualty_id": {
  "type": "text",
  "definition": "{{ #SOURCE.casualty_id }}"
 },
 "nether_casualty_record.campaign_id": {
  "type": "text",
  "definition": "{{ #SOURCE.campaign_id }}"
 },
 "nether_casualty_record.killer_person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.killer_person_id }}"
 },
 "nether_casualty_record.victim_person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.victim_person_id }}"
 },
 "nether_casualty_record.context": {
  "type": "text",
  "definition": "{{ #SOURCE.context }}"
 },
 "nether_employment.employment_id": {
  "type": "text",
  "definition": "{{ #SOURCE.employment_id }}"
 },
 "nether_employment.person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.person_id }}"
 },
 "nether_employment.business_id": {
  "type": "text",
  "definition": "{{ #SOURCE.business_id }}"
 },
 "nether_employment.role": {
  "type": "text",
  "definition": "{{ #SOURCE.role }}"
 },
 "nether_employment.started_on": {
  "type": "date",
  "definition": "{{ #SOURCE.started_on }}"
 },
 "nether_employment.ended_on": {
  "type": "date",
  "definition": "{{ #SOURCE.ended_on }}"
 },
 "nether_estate.estate_id": {
  "type": "text",
  "definition": "{{ #SOURCE.estate_id }}"
 },
 "nether_estate.name": {
  "type": "text",
  "definition": "{{ #SOURCE.name }}"
 },
 "nether_estate.region": {
  "type": "text",
  "definition": "{{ #SOURCE.region }}"
 },
 "nether_estate.hectares": {
  "type": "number",
  "definition": "{{ #SOURCE.hectares }}"
 },
 "nether_harvest_record.harvest_id": {
  "type": "text",
  "definition": "{{ #SOURCE.harvest_id }}"
 },
 "nether_harvest_record.estate_id": {
  "type": "text",
  "definition": "{{ #SOURCE.estate_id }}"
 },
 "nether_harvest_record.season_year": {
  "type": "number",
  "definition": "{{ #SOURCE.season_year }}"
 },
 "nether_harvest_record.crop": {
  "type": "text",
  "definition": "{{ #SOURCE.crop }}"
 },
 "nether_harvest_record.yield_measure": {
  "type": "number",
  "definition": "{{ #SOURCE.yield_measure }}"
 },
 "nether_holding.holding_id": {
  "type": "text",
  "definition": "{{ #SOURCE.holding_id }}"
 },
 "nether_holding.person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.person_id }}"
 },
 "nether_holding.estate_id": {
  "type": "text",
  "definition": "{{ #SOURCE.estate_id }}"
 },
 "nether_holding.from_date": {
  "type": "date",
  "definition": "{{ #SOURCE.from_date }}"
 },
 "nether_holding.to_date": {
  "type": "date",
  "definition": "{{ #SOURCE.to_date }}"
 },
 "nether_library.library_id": {
  "type": "text",
  "definition": "{{ #SOURCE.library_id }}"
 },
 "nether_library.name": {
  "type": "text",
  "definition": "{{ #SOURCE.name }}"
 },
 "nether_library.location": {
  "type": "text",
  "definition": "{{ #SOURCE.location }}"
 },
 "nether_library_card.card_id": {
  "type": "text",
  "definition": "{{ #SOURCE.card_id }}"
 },
 "nether_library_card.person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.person_id }}"
 },
 "nether_library_card.library_id": {
  "type": "text",
  "definition": "{{ #SOURCE.library_id }}"
 },
 "nether_library_card.issued_on": {
  "type": "date",
  "definition": "{{ #SOURCE.issued_on }}"
 },
 "nether_library_card.revoked_on": {
  "type": "date",
  "definition": "{{ #SOURCE.revoked_on }}"
 },
 "nether_oath.oath_id": {
  "type": "text",
  "definition": "{{ #SOURCE.oath_id }}"
 },
 "nether_oath.person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.person_id }}"
 },
 "nether_oath.sworn_on": {
  "type": "date",
  "definition": "{{ #SOURCE.sworn_on }}"
 },
 "nether_oath.subject": {
  "type": "text",
  "definition": "{{ #SOURCE.subject }}"
 },
 "nether_oath.kept": {
  "type": "truefalse",
  "definition": "{{ #SOURCE.kept }}"
 },
 "nether_oath.broken_on": {
  "type": "date",
  "definition": "{{ #SOURCE.broken_on }}"
 },
 "nether_obol_standard.birthplace": {
  "type": "text",
  "definition": "{{ #SOURCE.birthplace }}"
 },
 "nether_obol_standard.emblem": {
  "type": "text",
  "definition": "{{ #SOURCE.emblem }}"
 },
 "nether_obol_standard.mint_mark": {
  "type": "text",
  "definition": "{{ #SOURCE.mint_mark }}"
 },
 "nether_obol_standard.rim": {
  "type": "text",
  "definition": "{{ #SOURCE.rim }}"
 },
 "nether_obol_standard.metal": {
  "type": "text",
  "definition": "{{ #SOURCE.metal }}"
 },
 "nether_obol_standard.valid_from": {
  "type": "date",
  "definition": "{{ #SOURCE.valid_from }}"
 },
 "nether_obol_standard.valid_to": {
  "type": "text",
  "definition": "{{ #SOURCE.valid_to }}"
 },
 "nether_obol_standard.issue_location_1": {
  "type": "text",
  "definition": "{{ #SOURCE.issue_location_1 }}"
 },
 "nether_obol_standard.issue_location_2": {
  "type": "text",
  "definition": "{{ #SOURCE.issue_location_2 }}"
 },
 "nether_obol_standard.issue_location_3": {
  "type": "text",
  "definition": "{{ #SOURCE.issue_location_3 }}"
 },
 "nether_offering.offering_id": {
  "type": "text",
  "definition": "{{ #SOURCE.offering_id }}"
 },
 "nether_offering.person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.person_id }}"
 },
 "nether_offering.temple_id": {
  "type": "text",
  "definition": "{{ #SOURCE.temple_id }}"
 },
 "nether_offering.offered_on": {
  "type": "date",
  "definition": "{{ #SOURCE.offered_on }}"
 },
 "nether_offering.kind": {
  "type": "text",
  "definition": "{{ #SOURCE.kind }}"
 },
 "nether_offering.value": {
  "type": "number",
  "definition": "{{ #SOURCE.value }}"
 },
 "nether_ownership_transaction.txn_id": {
  "type": "text",
  "definition": "{{ #SOURCE.txn_id }}"
 },
 "nether_ownership_transaction.asset_id": {
  "type": "text",
  "definition": "{{ #SOURCE.asset_id }}"
 },
 "nether_ownership_transaction.seller_person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.seller_person_id }}"
 },
 "nether_ownership_transaction.buyer_person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.buyer_person_id }}"
 },
 "nether_ownership_transaction.transacted_on": {
  "type": "date",
  "definition": "{{ #SOURCE.transacted_on }}"
 },
 "nether_ownership_transaction.price": {
  "type": "number",
  "definition": "{{ #SOURCE.price }}"
 },
 "nether_passage_permit.permit_id": {
  "type": "text",
  "definition": "{{ #SOURCE.permit_id }}"
 },
 "nether_passage_permit.person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.person_id }}"
 },
 "nether_passage_permit.seal": {
  "type": "text",
  "definition": "{{ #SOURCE.seal }}"
 },
 "nether_passage_permit.issued_on": {
  "type": "date",
  "definition": "{{ #SOURCE.issued_on }}"
 },
 "nether_passage_permit.expires_on": {
  "type": "date",
  "definition": "{{ #SOURCE.expires_on }}"
 },
 "nether_passage_permit.status": {
  "type": "text",
  "definition": "{{ #SOURCE.status }}"
 },
 "nether_patient_case.patient_case_id": {
  "type": "text",
  "definition": "{{ #SOURCE.patient_case_id }}"
 },
 "nether_patient_case.healer_person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.healer_person_id }}"
 },
 "nether_patient_case.patient_person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.patient_person_id }}"
 },
 "nether_patient_case.ailment_id": {
  "type": "text",
  "definition": "{{ #SOURCE.ailment_id }}"
 },
 "nether_patient_case.treated_on": {
  "type": "date",
  "definition": "{{ #SOURCE.treated_on }}"
 },
 "nether_patient_case.outcome": {
  "type": "text",
  "definition": "{{ #SOURCE.outcome }}"
 },
 "nether_patient_case.fee": {
  "type": "number",
  "definition": "{{ #SOURCE.fee }}"
 },
 "nether_person.person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.person_id }}"
 },
 "nether_person.name": {
  "type": "text",
  "definition": "{{ #SOURCE.name }}"
 },
 "nether_person.birthdate": {
  "type": "date",
  "definition": "{{ #SOURCE.birthdate }}"
 },
 "nether_person.birthplace": {
  "type": "text",
  "definition": "{{ #SOURCE.birthplace }}"
 },
 "nether_person.death_date": {
  "type": "date",
  "definition": "{{ #SOURCE.death_date }}"
 },
 "nether_person.gate": {
  "type": "text",
  "definition": "{{ #SOURCE.gate }}"
 },
 "nether_person.identity_id": {
  "type": "text",
  "definition": "{{ #SOURCE.identity_id }}"
 },
 "nether_person.issue_place": {
  "type": "text",
  "definition": "{{ #SOURCE.issue_place }}"
 },
 "nether_relationship.relationship_id": {
  "type": "text",
  "definition": "{{ #SOURCE.relationship_id }}"
 },
 "nether_relationship.person_a_id": {
  "type": "text",
  "definition": "{{ #SOURCE.person_a_id }}"
 },
 "nether_relationship.person_b_id": {
  "type": "text",
  "definition": "{{ #SOURCE.person_b_id }}"
 },
 "nether_relationship.bond_type": {
  "type": "text",
  "definition": "{{ #SOURCE.bond_type }}"
 },
 "nether_relationship.bonded_from": {
  "type": "date",
  "definition": "{{ #SOURCE.bonded_from }}"
 },
 "nether_relationship.bonded_to": {
  "type": "text",
  "definition": "{{ #SOURCE.bonded_to }}"
 },
 "nether_service.service_id": {
  "type": "text",
  "definition": "{{ #SOURCE.service_id }}"
 },
 "nether_service.person_id": {
  "type": "text",
  "definition": "{{ #SOURCE.person_id }}"
 },
 "nether_service.campaign_id": {
  "type": "text",
  "definition": "{{ #SOURCE.campaign_id }}"
 },
 "nether_service.rank": {
  "type": "text",
  "definition": "{{ #SOURCE.rank }}"
 },
 "nether_service.joined_on": {
  "type": "date",
  "definition": "{{ #SOURCE.joined_on }}"
 },
 "nether_service.left_on": {
  "type": "date",
  "definition": "{{ #SOURCE.left_on }}"
 },
 "nether_temple.temple_id": {
  "type": "text",
  "definition": "{{ #SOURCE.temple_id }}"
 },
 "nether_temple.deity": {
  "type": "text",
  "definition": "{{ #SOURCE.deity }}"
 },
 "nether_temple.location": {
  "type": "text",
  "definition": "{{ #SOURCE.location }}"
 }
};
 const metrics={
 "patients_treated": {
  "description": "Cases this healer took.",
  "definition": "nether_patient_case | count(nether_patient_case.patient_case_id)"
 },
 "patients_recovered": {
  "description": "Cases that ended in recovery.",
  "definition": "nether_patient_case | where(nether_patient_case.outcome == 'recovered') | count(nether_patient_case.patient_case_id)"
 },
 "recovery_rate": {
  "description": "Recovered cases over all cases taken. A healer who took only easy cases will look better than one who did not.",
  "definition": "coalesce(patients_recovered, 0) * 1.0 / patients_treated"
 },
 "assets_acquired": {
  "description": "Transactions in which this soul was the buyer.",
  "definition": "nether_ownership_transaction | count(nether_ownership_transaction.txn_id)"
 },
 "total_paid": {
  "description": "Sum of prices paid, at transaction grain.",
  "definition": "nether_ownership_transaction | sum(nether_ownership_transaction.price)"
 },
 "souls_killed": {
  "description": "Every killing recorded against this soul, in battle or out of it.",
  "definition": "nether_casualty_record | count(nether_casualty_record.casualty_id)"
 },
 "killed_in_battle": {
  "description": "Killings recorded in the course of a campaign.",
  "definition": "nether_casualty_record | where(nether_casualty_record.context == 'battle') | count(nether_casualty_record.casualty_id)"
 },
 "killed_outside_battle": {
  "description": "What is left when battle is taken out.",
  "definition": "souls_killed - coalesce(killed_in_battle, 0)"
 },
 "offerings_made": {
  "description": "Offerings this soul laid at a temple.",
  "definition": "nether_offering | count(nether_offering.offering_id)"
 },
 "oaths_sworn": {
  "description": "Oaths this soul swore, kept or not.",
  "definition": "nether_oath | count(nether_oath.oath_id)"
 },
 "oaths_broken": {
  "description": "Oaths that did not hold.",
  "definition": "nether_oath | where(nether_oath.kept == false) | count(nether_oath.oath_id)"
 },
 "employers": {
  "description": "Separate businesses this soul worked for.",
  "definition": "count_distinct(nether_business.business_id)"
 },
 "years_employed": {
  "description": "Years of recorded work. An open end date runs to the death date.",
  "definition": "nether_employment | sum(date_diff('year', nether_employment.started_on, coalesce(nether_employment.ended_on, nether_person.death_date)))"
 },
 "harvests_recorded": {
  "description": "Seasons of harvest recorded on the estates this soul held.",
  "definition": "nether_harvest_record | count(nether_harvest_record.harvest_id)"
 },
 "average_yield": {
  "description": "Total yield over harvests recorded: what a typical season brought in.",
  "definition": "total_yield * 1.0 / harvests_recorded"
 },
 "total_yield": {
  "description": "Everything the estates brought in, at harvest grain.",
  "definition": "nether_harvest_record | sum(nether_harvest_record.yield_measure)"
 },
 "souls_bonded": {
  "description": "Bonds recorded against this soul: marriages, kinships, wardships.",
  "definition": "nether_relationship | count(nether_relationship.relationship_id)"
 },
 "permits_held": {
  "description": "Passage permits issued in this soul’s name, spent or not.",
  "definition": "nether_passage_permit | count(nether_passage_permit.permit_id)"
 },
 "books_borrowed": {
  "description": "Borrowings recorded against this soul’s cards, counted once each.",
  "definition": "nether_borrowing_record | count(nether_borrowing_record.borrow_id)"
 },
 "distinct_books_borrowed": {
  "description": "Separate titles carried out, however many times each was taken.",
  "definition": "count_distinct(nether_book.book_id)"
 },
 "books_never_returned": {
  "description": "Borrowings with no return date. The library is still waiting.",
  "definition": "nether_borrowing_record | where(nether_borrowing_record.returned_on is null) | count(nether_borrowing_record.borrow_id)"
 }
};
 return {metric:name=>metrics[name]||{description:'',definition:''},model:id=>models[id]||'',field:(model,field)=>fields[model+'.'+field]||'',
  fieldDefinition:(model,field)=>fieldDefinitions[model+'.'+field]?.definition||'',
  fieldInfo:(model,field)=>({...fieldDefinitions[model+'.'+field],description:fields[model+'.'+field]||''})};
})();
