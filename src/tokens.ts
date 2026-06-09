export const TBL = {
  ink:   '#ece7da',
  ink2:  '#b3ab97',
  ink3:  '#7c745f',
  ink4:  '#544d3d',
  amber: '#d6a050',
  amber2:'#f0c074',
  violet:'#8a7ad6',
  good:  '#74c08a',
  danger:'#e06a6a',
  mat0:  '#16130d',
  mat1:  '#1d1810',
  mat2:  '#241d13',
  matLine:  'rgba(214,176,108,0.20)',
  matLine2: 'rgba(214,176,108,0.40)',
  matGlow:  'rgba(214,160,80,0.06)',
  stock:    '#211c2b',
  stock2:   '#171320',
  stockEdge:'#0d0b14',
  textbox:  '#15111d',
} as const;

export const CLASSCLR: Record<string, string> = {
  Warrior:   '#c25450',
  Rogue:     '#9c9893',
  Wizard:    '#5a8fcf',
  Sorcerer:  '#d97a3a',
  Paladin:   '#d6b94f',
  Druid:     '#6fae5a',
  Bard:      '#c466a8',
  Builder:   '#b0895a',
  'Doom-Whisperer': '#9170b8',
  Necromancer: '#7a7ab0',
  Classless: '#cfcdc4',
};

export const CLASSDARK: Record<string, string> = {
  Warrior: '#7d2f2c',
  Rogue:   '#5c5954',
  Wizard:  '#2f4f78',
  Sorcerer:'#83441b',
  Paladin: '#856e1f',
  Druid:   '#3c6730',
  Bard:    '#76305f',
  Builder: '#6a4f2e',
  'Doom-Whisperer': '#523a6b',
  Necromancer: '#42426b',
  Classless: '#76746c',
};

export const GLYPH: Record<string, string> = {
  Warrior: '⚔',
  Rogue:   '🗡',
  Wizard:  '◓',
  Sorcerer:'✦',
  Paladin: '✚',
  Druid:   '❦',
  Bard:    '♪',
  Builder: '⚒',
  'Doom-Whisperer': '☾',
  Necromancer: '☠',
};

export const PHASES = [
  { id: 'ready',  label: 'Ready' },
  { id: 'draw',   label: 'Draw' },
  { id: 'cz',     label: 'Class Zone' },
  { id: 'action', label: 'Action' },
  { id: 'end',    label: 'End' },
] as const;
