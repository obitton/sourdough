import type { Func } from './types';

export const FIRST_NAMES = [
  'Adam', 'Breno', 'Griffin', 'Ofir', 'Maya', 'Noa', 'Liam', 'Sofia', 'Mateo',
  'Yuki', 'Priya', 'Arjun', 'Wei', 'Mei', 'Omar', 'Layla', 'Zainab', 'Kwame',
  'Amara', 'Chidi', 'Ngozi', 'Diego', 'Camila', 'Lucas', 'Valentina', 'Elena',
  'Dmitri', 'Anya', 'Henrik', 'Freja', 'Astrid', 'Emma', 'Olivia', 'Ava',
  'Ethan', 'Mason', 'Ella', 'Grace', 'Jack', 'Ruby', 'Aiden', 'Chloe',
  'Marcus', 'Jasmine', 'Tyler', 'Alexis', 'Jordan', 'Taylor', 'Morgan',
  'Casey', 'Riley', 'Quinn', 'Avery', 'Rowan', 'Sage', 'Elliot', 'Nina',
  'Theo', 'Iris', 'Felix', 'Clara', 'Oscar', 'Stella', 'Hugo', 'Alma',
  'Ravi', 'Ananya', 'Kenji', 'Sakura', 'Tunde', 'Fatima', 'Hassan', 'Leila',
  'Samir', 'Dalia',
] as const;

export const LAST_NAMES = [
  'Chen', 'Patel', 'Kim', 'Nguyen', 'Garcia', 'Rodriguez', 'Martinez',
  'Lopez', 'Silva', 'Santos', 'Costa', 'Oliveira', 'Johnson', 'Smith',
  'Williams', 'Brown', 'Jones', 'Miller', 'Davis', 'Wilson', 'Anderson',
  'Taylor', 'Thomas', 'Moore', 'Jackson', 'White', 'Harris', 'Clark',
  'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright', 'Scott', 'Green',
  'Baker', 'Adams', 'Nelson', 'Hill', 'Campbell', 'Mitchell', 'Roberts',
  'Carter', 'Phillips', 'Evans', 'Turner', 'Torres', 'Parker', 'Collins',
  'Edwards', 'Stewart', 'Morris', 'Murphy', 'Cook', 'Rogers', 'Reed',
  'Bailey', 'Bell', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Ward',
  'Brooks', 'Gray', 'Watson', 'Sanders', 'Price', 'Bennett', 'Okafor',
  'Adeyemi', 'Mensah', 'Ivanov', 'Petrova', 'Novak', 'Kowalski', 'Haddad',
  'Rahman', 'Sato', 'Tanaka', 'Yamamoto', 'Sharma', 'Gupta', 'Singh',
  'Kaur', 'Ali', 'Hussain', 'Abadi',
] as const;

export const CITIES = [
  'Charlotte, NC', 'New York, NY', 'San Francisco, CA', 'Austin, TX',
  'Denver, CO', 'Chicago, IL', 'Seattle, WA', 'Miami, FL', 'Boston, MA',
  'Raleigh, NC', 'Nashville, TN', 'Portland, OR',
] as const;

// Fictional acquirers — real company names would read as claims about real firms.
export const ACQUIRERS = [
  'Workwise', 'PeopleCore', 'Atlas HQ', 'Beacon Systems', 'Ledgerline',
  'Northstar Software', 'Grainhouse', 'Croissant Capital',
] as const;

// Bread-adjacent, in the spirit of the host. Croutons come from somewhere.
export const COMPANY_NAMES = [
  'Rye', 'Crumb & Co', 'Batchwork', 'Ovenly', 'Millstone', 'Hearthside',
  'Levain Labs', 'Knead', 'Semolina', 'Brioche', 'Proofing Room', 'Bannock',
] as const;

export const TEAM_NAMES: Record<Func, string> = {
  engineering: 'Engineering',
  design: 'Design',
  gtm: 'GTM',
  operations: 'Operations',
};
