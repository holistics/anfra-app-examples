/* Generated automatically by scripts/build_nether_wiki_catalog.py --watch. Offline AML metadata only; game facts are read directly by wiki-sync.js. */
window.NetherWikiCatalog = {
 "books": [
  {
   "id": "identity",
   "dataset": "nether_identity",
   "title": "The Book of Names",
   "summary": "Who a soul was, who they were bound to, and what permit they carry.",
   "models": [
    {
     "id": "nether_person",
     "title": "Person",
     "description": ""
    },
    {
     "id": "nether_relationship",
     "title": "Relationship",
     "description": ""
    },
    {
     "id": "nether_passage_permit",
     "title": "Passage Permit",
     "description": ""
    }
   ],
   "metrics": [
    {
     "id": "souls_bonded",
     "title": "Souls bonded",
     "description": "Bonds recorded against this soul: marriages, kinships, wardships."
    },
    {
     "id": "permits_held",
     "title": "Permits held",
     "description": "Passage permits issued in this soul’s name, spent or not."
    }
   ]
  },
  {
   "id": "property",
   "dataset": "nether_property",
   "title": "The Book of Holdings",
   "summary": "What changed hands, when, for how much. A first registration has no seller.",
   "models": [
    {
     "id": "nether_person",
     "title": "Person",
     "description": ""
    },
    {
     "id": "nether_asset",
     "title": "Asset",
     "description": ""
    },
    {
     "id": "nether_ownership_transaction",
     "title": "Ownership Transaction",
     "description": ""
    }
   ],
   "metrics": [
    {
     "id": "assets_acquired",
     "title": "Assets acquired",
     "description": "Transactions in which this soul was the buyer."
    },
    {
     "id": "total_paid",
     "title": "Total paid",
     "description": "Sum of prices paid, at transaction grain."
    }
   ]
  },
  {
   "id": "borrowings",
   "dataset": "nether_borrowings",
   "title": "The Book of Borrowings",
   "summary": "Every card issued, every copy shelved, every book carried out of a library and whether it came back. The library that issued a card and the library that shelves a copy are not always the same one.",
   "models": [
    {
     "id": "nether_person",
     "title": "Person",
     "description": ""
    },
    {
     "id": "nether_library",
     "title": "Library",
     "description": ""
    },
    {
     "id": "nether_library_card",
     "title": "Library Card",
     "description": ""
    },
    {
     "id": "nether_book",
     "title": "Book",
     "description": ""
    },
    {
     "id": "nether_book_copy",
     "title": "Book Copy",
     "description": ""
    },
    {
     "id": "nether_borrowing_record",
     "title": "Borrowing Record",
     "description": ""
    }
   ],
   "metrics": [
    {
     "id": "books_borrowed",
     "title": "Books borrowed",
     "description": "Borrowings recorded against this soul’s cards, counted once each."
    },
    {
     "id": "distinct_books_borrowed",
     "title": "Distinct books borrowed",
     "description": "Separate titles carried out, however many times each was taken."
    },
    {
     "id": "books_never_returned",
     "title": "Books never returned",
     "description": "Borrowings with no return date. The library is still waiting."
    }
   ]
  },
  {
   "id": "work",
   "dataset": "nether_work",
   "title": "The Book of Trades",
   "summary": "Who employed a soul, in what role, and for how long. An open end date means the work ran until they died. Employment with no business is self-employment: a musician or a poet works for no house.",
   "models": [
    {
     "id": "nether_person",
     "title": "Person",
     "description": ""
    },
    {
     "id": "nether_business",
     "title": "Business",
     "description": ""
    },
    {
     "id": "nether_employment",
     "title": "Employment",
     "description": ""
    }
   ],
   "metrics": [
    {
     "id": "employers",
     "title": "Employers",
     "description": "Separate businesses this soul worked for."
    },
    {
     "id": "years_employed",
     "title": "Years employed",
     "description": "Years of recorded work. An open end date runs to the death date."
    }
   ]
  },
  {
   "id": "healing",
   "dataset": "nether_healing",
   "title": "The Book of Healthcare",
   "summary": "Every case a healer took, what ailed the patient and whether they recovered. The soul under examination is the healer.",
   "models": [
    {
     "id": "nether_person",
     "title": "Person",
     "description": ""
    },
    {
     "id": "nether_ailment",
     "title": "Ailment",
     "description": ""
    },
    {
     "id": "nether_patient_case",
     "title": "Patient Case",
     "description": ""
    }
   ],
   "metrics": [
    {
     "id": "patients_treated",
     "title": "Patients treated",
     "description": "Cases this healer took."
    },
    {
     "id": "patients_recovered",
     "title": "Patients recovered",
     "description": "Cases that ended in recovery."
    },
    {
     "id": "recovery_rate",
     "title": "Recovery rate",
     "description": "Recovered cases over all cases taken. A healer who took only easy cases will look better than one who did not."
    }
   ]
  },
  {
   "id": "arms",
   "dataset": "nether_arms",
   "title": "The Book of Battle",
   "summary": "Campaigns, who served in them and who was killed. A killing with no campaign happened outside battle.",
   "models": [
    {
     "id": "nether_person",
     "title": "Person",
     "description": ""
    },
    {
     "id": "nether_campaign",
     "title": "Campaign",
     "description": ""
    },
    {
     "id": "nether_service",
     "title": "Service",
     "description": ""
    },
    {
     "id": "nether_casualty_record",
     "title": "Casualty Record",
     "description": ""
    }
   ],
   "metrics": [
    {
     "id": "souls_killed",
     "title": "Souls killed",
     "description": "Every killing recorded against this soul, in battle or out of it."
    },
    {
     "id": "killed_in_battle",
     "title": "Killed in battle",
     "description": "Killings recorded in the course of a campaign."
    },
    {
     "id": "killed_outside_battle",
     "title": "Killed outside battle",
     "description": "What is left when battle is taken out."
    }
   ]
  },
  {
   "id": "harvest",
   "dataset": "nether_harvest",
   "title": "The Book of Agriculture",
   "summary": "Estates held and what they yielded, season by season.",
   "models": [
    {
     "id": "nether_person",
     "title": "Person",
     "description": ""
    },
    {
     "id": "nether_estate",
     "title": "Estate",
     "description": ""
    },
    {
     "id": "nether_holding",
     "title": "Holding",
     "description": ""
    },
    {
     "id": "nether_harvest_record",
     "title": "Harvest Record",
     "description": ""
    }
   ],
   "metrics": [
    {
     "id": "total_yield",
     "title": "Total yield",
     "description": "Everything the estates brought in, at harvest grain."
    },
    {
     "id": "harvests_recorded",
     "title": "Harvests recorded",
     "description": "Seasons of harvest recorded on the estates this soul held."
    },
    {
     "id": "average_yield",
     "title": "Average yield",
     "description": "Total yield over harvests recorded: what a typical season brought in."
    }
   ]
  },
  {
   "id": "rites",
   "dataset": "nether_rites",
   "title": "The Book of Religion",
   "summary": "Offerings laid at temples, and oaths sworn and whether they held. The soul under examination is the one who gave or swore.",
   "models": [
    {
     "id": "nether_person",
     "title": "Person",
     "description": ""
    },
    {
     "id": "nether_temple",
     "title": "Temple",
     "description": ""
    },
    {
     "id": "nether_offering",
     "title": "Offering",
     "description": ""
    },
    {
     "id": "nether_oath",
     "title": "Oath",
     "description": ""
    }
   ],
   "metrics": [
    {
     "id": "offerings_made",
     "title": "Offerings made",
     "description": "Offerings this soul laid at a temple."
    },
    {
     "id": "oaths_sworn",
     "title": "Oaths sworn",
     "description": "Oaths this soul swore, kept or not."
    },
    {
     "id": "oaths_broken",
     "title": "Oaths broken",
     "description": "Oaths that did not hold."
    }
   ]
  }
 ],
 "fields": {
  "nether_person.person_id": {
   "label": "Person Id",
   "model": "Person"
  },
  "nether_person.name": {
   "label": "Name",
   "model": "Person"
  },
  "nether_person.birthdate": {
   "label": "Birthdate",
   "model": "Person"
  },
  "nether_person.birthplace": {
   "label": "Birthplace",
   "model": "Person"
  },
  "nether_person.death_date": {
   "label": "Death Date",
   "model": "Person"
  },
  "nether_person.gate": {
   "label": "Gate",
   "model": "Person"
  },
  "nether_person.identity_id": {
   "label": "Identity Id",
   "model": "Person"
  },
  "nether_person.issue_place": {
   "label": "Issue Place",
   "model": "Person"
  },
  "nether_relationship.relationship_id": {
   "label": "Relationship Id",
   "model": "Relationship"
  },
  "nether_relationship.person_a_id": {
   "label": "Person A Id",
   "model": "Relationship"
  },
  "nether_relationship.person_b_id": {
   "label": "Person B Id",
   "model": "Relationship"
  },
  "nether_relationship.bond_type": {
   "label": "Bond Type",
   "model": "Relationship"
  },
  "nether_relationship.bonded_from": {
   "label": "Bonded From",
   "model": "Relationship"
  },
  "nether_relationship.bonded_to": {
   "label": "Bonded To",
   "model": "Relationship"
  },
  "nether_passage_permit.permit_id": {
   "label": "Permit Id",
   "model": "Passage Permit"
  },
  "nether_passage_permit.person_id": {
   "label": "Person Id",
   "model": "Passage Permit"
  },
  "nether_passage_permit.seal": {
   "label": "Seal",
   "model": "Passage Permit"
  },
  "nether_passage_permit.issued_on": {
   "label": "Issued On",
   "model": "Passage Permit"
  },
  "nether_passage_permit.expires_on": {
   "label": "Expires On",
   "model": "Passage Permit"
  },
  "nether_passage_permit.status": {
   "label": "Status",
   "model": "Passage Permit"
  },
  "souls_bonded": {
   "label": "Souls bonded",
   "model": "Metric"
  },
  "permits_held": {
   "label": "Permits held",
   "model": "Metric"
  },
  "nether_asset.asset_id": {
   "label": "Asset Id",
   "model": "Asset"
  },
  "nether_asset.asset_type": {
   "label": "Asset Type",
   "model": "Asset"
  },
  "nether_asset.name": {
   "label": "Name",
   "model": "Asset"
  },
  "nether_asset.location": {
   "label": "Location",
   "model": "Asset"
  },
  "nether_ownership_transaction.txn_id": {
   "label": "Txn Id",
   "model": "Ownership Transaction"
  },
  "nether_ownership_transaction.asset_id": {
   "label": "Asset Id",
   "model": "Ownership Transaction"
  },
  "nether_ownership_transaction.seller_person_id": {
   "label": "Seller Person Id",
   "model": "Ownership Transaction"
  },
  "nether_ownership_transaction.buyer_person_id": {
   "label": "Buyer Person Id",
   "model": "Ownership Transaction"
  },
  "nether_ownership_transaction.transacted_on": {
   "label": "Transacted On",
   "model": "Ownership Transaction"
  },
  "nether_ownership_transaction.price": {
   "label": "Price",
   "model": "Ownership Transaction"
  },
  "assets_acquired": {
   "label": "Assets acquired",
   "model": "Metric"
  },
  "total_paid": {
   "label": "Total paid",
   "model": "Metric"
  },
  "nether_library.library_id": {
   "label": "Library Id",
   "model": "Library"
  },
  "nether_library.name": {
   "label": "Name",
   "model": "Library"
  },
  "nether_library.location": {
   "label": "Location",
   "model": "Library"
  },
  "nether_library_card.card_id": {
   "label": "Card Id",
   "model": "Library Card"
  },
  "nether_library_card.person_id": {
   "label": "Person Id",
   "model": "Library Card"
  },
  "nether_library_card.library_id": {
   "label": "Library Id",
   "model": "Library Card"
  },
  "nether_library_card.issued_on": {
   "label": "Issued On",
   "model": "Library Card"
  },
  "nether_library_card.revoked_on": {
   "label": "Revoked On",
   "model": "Library Card"
  },
  "nether_book.book_id": {
   "label": "Book Id",
   "model": "Book"
  },
  "nether_book.title": {
   "label": "Title",
   "model": "Book"
  },
  "nether_book.author": {
   "label": "Author",
   "model": "Book"
  },
  "nether_book.subject": {
   "label": "Subject",
   "model": "Book"
  },
  "nether_book_copy.copy_id": {
   "label": "Copy Id",
   "model": "Book Copy"
  },
  "nether_book_copy.book_id": {
   "label": "Book Id",
   "model": "Book Copy"
  },
  "nether_book_copy.library_id": {
   "label": "Library Id",
   "model": "Book Copy"
  },
  "nether_borrowing_record.borrow_id": {
   "label": "Borrow Id",
   "model": "Borrowing Record"
  },
  "nether_borrowing_record.card_id": {
   "label": "Card Id",
   "model": "Borrowing Record"
  },
  "nether_borrowing_record.copy_id": {
   "label": "Copy Id",
   "model": "Borrowing Record"
  },
  "nether_borrowing_record.borrowed_on": {
   "label": "Borrowed On",
   "model": "Borrowing Record"
  },
  "nether_borrowing_record.returned_on": {
   "label": "Returned On",
   "model": "Borrowing Record"
  },
  "books_borrowed": {
   "label": "Books borrowed",
   "model": "Metric"
  },
  "distinct_books_borrowed": {
   "label": "Distinct books borrowed",
   "model": "Metric"
  },
  "books_never_returned": {
   "label": "Books never returned",
   "model": "Metric"
  },
  "nether_business.business_id": {
   "label": "Business Id",
   "model": "Business"
  },
  "nether_business.name": {
   "label": "Name",
   "model": "Business"
  },
  "nether_business.trade": {
   "label": "Trade",
   "model": "Business"
  },
  "nether_business.location": {
   "label": "Location",
   "model": "Business"
  },
  "nether_employment.employment_id": {
   "label": "Employment Id",
   "model": "Employment"
  },
  "nether_employment.person_id": {
   "label": "Person Id",
   "model": "Employment"
  },
  "nether_employment.business_id": {
   "label": "Business Id",
   "model": "Employment"
  },
  "nether_employment.role": {
   "label": "Role",
   "model": "Employment"
  },
  "nether_employment.started_on": {
   "label": "Started On",
   "model": "Employment"
  },
  "nether_employment.ended_on": {
   "label": "Ended On",
   "model": "Employment"
  },
  "employers": {
   "label": "Employers",
   "model": "Metric"
  },
  "years_employed": {
   "label": "Years employed",
   "model": "Metric"
  },
  "nether_ailment.ailment_id": {
   "label": "Ailment Id",
   "model": "Ailment"
  },
  "nether_ailment.name": {
   "label": "Name",
   "model": "Ailment"
  },
  "nether_ailment.severity": {
   "label": "Severity",
   "model": "Ailment"
  },
  "nether_patient_case.patient_case_id": {
   "label": "Patient Case Id",
   "model": "Patient Case"
  },
  "nether_patient_case.healer_person_id": {
   "label": "Healer Person Id",
   "model": "Patient Case"
  },
  "nether_patient_case.patient_person_id": {
   "label": "Patient Person Id",
   "model": "Patient Case"
  },
  "nether_patient_case.ailment_id": {
   "label": "Ailment Id",
   "model": "Patient Case"
  },
  "nether_patient_case.treated_on": {
   "label": "Treated On",
   "model": "Patient Case"
  },
  "nether_patient_case.outcome": {
   "label": "Outcome",
   "model": "Patient Case"
  },
  "nether_patient_case.fee": {
   "label": "Fee",
   "model": "Patient Case"
  },
  "patients_treated": {
   "label": "Patients treated",
   "model": "Metric"
  },
  "patients_recovered": {
   "label": "Patients recovered",
   "model": "Metric"
  },
  "recovery_rate": {
   "label": "Recovery rate",
   "model": "Metric"
  },
  "nether_campaign.campaign_id": {
   "label": "Campaign Id",
   "model": "Campaign"
  },
  "nether_campaign.name": {
   "label": "Name",
   "model": "Campaign"
  },
  "nether_campaign.started_on": {
   "label": "Started On",
   "model": "Campaign"
  },
  "nether_campaign.ended_on": {
   "label": "Ended On",
   "model": "Campaign"
  },
  "nether_campaign.region": {
   "label": "Region",
   "model": "Campaign"
  },
  "nether_service.service_id": {
   "label": "Service Id",
   "model": "Service"
  },
  "nether_service.person_id": {
   "label": "Person Id",
   "model": "Service"
  },
  "nether_service.campaign_id": {
   "label": "Campaign Id",
   "model": "Service"
  },
  "nether_service.rank": {
   "label": "Rank",
   "model": "Service"
  },
  "nether_service.joined_on": {
   "label": "Joined On",
   "model": "Service"
  },
  "nether_service.left_on": {
   "label": "Left On",
   "model": "Service"
  },
  "nether_casualty_record.casualty_id": {
   "label": "Casualty Id",
   "model": "Casualty Record"
  },
  "nether_casualty_record.campaign_id": {
   "label": "Campaign Id",
   "model": "Casualty Record"
  },
  "nether_casualty_record.killer_person_id": {
   "label": "Killer Person Id",
   "model": "Casualty Record"
  },
  "nether_casualty_record.victim_person_id": {
   "label": "Victim Person Id",
   "model": "Casualty Record"
  },
  "nether_casualty_record.context": {
   "label": "Context",
   "model": "Casualty Record"
  },
  "souls_killed": {
   "label": "Souls killed",
   "model": "Metric"
  },
  "killed_in_battle": {
   "label": "Killed in battle",
   "model": "Metric"
  },
  "killed_outside_battle": {
   "label": "Killed outside battle",
   "model": "Metric"
  },
  "nether_estate.estate_id": {
   "label": "Estate Id",
   "model": "Estate"
  },
  "nether_estate.name": {
   "label": "Name",
   "model": "Estate"
  },
  "nether_estate.region": {
   "label": "Region",
   "model": "Estate"
  },
  "nether_estate.hectares": {
   "label": "Hectares",
   "model": "Estate"
  },
  "nether_holding.holding_id": {
   "label": "Holding Id",
   "model": "Holding"
  },
  "nether_holding.person_id": {
   "label": "Person Id",
   "model": "Holding"
  },
  "nether_holding.estate_id": {
   "label": "Estate Id",
   "model": "Holding"
  },
  "nether_holding.from_date": {
   "label": "From Date",
   "model": "Holding"
  },
  "nether_holding.to_date": {
   "label": "To Date",
   "model": "Holding"
  },
  "nether_harvest_record.harvest_id": {
   "label": "Harvest Id",
   "model": "Harvest Record"
  },
  "nether_harvest_record.estate_id": {
   "label": "Estate Id",
   "model": "Harvest Record"
  },
  "nether_harvest_record.season_year": {
   "label": "Season Year",
   "model": "Harvest Record"
  },
  "nether_harvest_record.crop": {
   "label": "Crop",
   "model": "Harvest Record"
  },
  "nether_harvest_record.yield_measure": {
   "label": "Yield Measure",
   "model": "Harvest Record"
  },
  "total_yield": {
   "label": "Total yield",
   "model": "Metric"
  },
  "harvests_recorded": {
   "label": "Harvests recorded",
   "model": "Metric"
  },
  "average_yield": {
   "label": "Average yield",
   "model": "Metric"
  },
  "nether_temple.temple_id": {
   "label": "Temple Id",
   "model": "Temple"
  },
  "nether_temple.deity": {
   "label": "Deity",
   "model": "Temple"
  },
  "nether_temple.location": {
   "label": "Location",
   "model": "Temple"
  },
  "nether_offering.offering_id": {
   "label": "Offering Id",
   "model": "Offering"
  },
  "nether_offering.person_id": {
   "label": "Person Id",
   "model": "Offering"
  },
  "nether_offering.temple_id": {
   "label": "Temple Id",
   "model": "Offering"
  },
  "nether_offering.offered_on": {
   "label": "Offered On",
   "model": "Offering"
  },
  "nether_offering.kind": {
   "label": "Kind",
   "model": "Offering"
  },
  "nether_offering.value": {
   "label": "Value",
   "model": "Offering"
  },
  "nether_oath.oath_id": {
   "label": "Oath Id",
   "model": "Oath"
  },
  "nether_oath.person_id": {
   "label": "Person Id",
   "model": "Oath"
  },
  "nether_oath.sworn_on": {
   "label": "Sworn On",
   "model": "Oath"
  },
  "nether_oath.subject": {
   "label": "Subject",
   "model": "Oath"
  },
  "nether_oath.kept": {
   "label": "Kept",
   "model": "Oath"
  },
  "nether_oath.broken_on": {
   "label": "Broken On",
   "model": "Oath"
  },
  "offerings_made": {
   "label": "Offerings made",
   "model": "Metric"
  },
  "oaths_sworn": {
   "label": "Oaths sworn",
   "model": "Metric"
  },
  "oaths_broken": {
   "label": "Oaths broken",
   "model": "Metric"
  }
 },
 "revision": "050b85b5f39ffa12bf5093957ddaf263eda5c8c0592e74c6462cd44ebbb9d2ef"
};
