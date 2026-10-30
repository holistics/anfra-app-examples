"""Calendar and issuing offices shared by generation and additive migration.

Storage is a chronological realm epoch, not an AD date: storage year Y reads
as (1000 - Y) BC. Keeping dates increasing preserves native AQL date arithmetic.
"""
import datetime as dt
import hashlib
import string

EPOCH = 1000
FIRST_DAY = dt.date(547, 6, 21)
PERMIT_ISSUED = dt.date(547, 6, 1)
PERMIT_EXPIRES = dt.date(548, 6, 1)
EXPIRED_PERMIT = dt.date(547, 6, 10)
ISSUE_LOCATIONS = {
    'Thrace': ['White Gate', 'Cedar Steps', 'Northern Quay'],
    'Thessaly': ['Horse Plain', 'Laurel Gate', 'Riverwatch'],
    'Boeotia': ['Reed Market', 'Seven Wells', 'West Arch'],
    'Argos': ['Bronze Gate', 'Red Hill', 'Potter’s Square'],
    'Corinth': ['Twin Harbours', 'Isthmus Gate', 'Stone Market'],
    'Samos': ['Moon Quay', 'Olive Terrace', 'East Haven'],
    'Lydia': ['Amber Road', 'Lion Gate', 'Golden Court'],
    'Naucratis': ['Lotus Quay', 'River Gate', 'Scribe’s Court'],
    'Syracuse': ['Dolphin Harbour', 'South Arch', 'Fountain Steps'],
}


def identity_fields(person):
    """Stable identifiers without drawing from the world's seeded RNG."""
    digest = hashlib.sha256(('nether-identity:' + person['person_id']).encode()).digest()
    alphabet = string.ascii_uppercase + string.digits   # identity IDs are capitals and digits only: HUY9-8776
    code = ''.join(alphabet[n % len(alphabet)] for n in digest[:8])
    offices = ISSUE_LOCATIONS[person['birthplace']]
    return dict(identity_id=code[:4] + '-' + code[4:], issue_place=offices[digest[8] % len(offices)])


def current_date(day):
    return (FIRST_DAY + dt.timedelta(days=max(1, int(day)) - 1)).isoformat()


def fmt(value):
    value = str(value)[:10]
    year, month, day = value.split('-')
    return f'{day}.{month}.{EPOCH - int(year):03d} BC'
