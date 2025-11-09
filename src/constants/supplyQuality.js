export const SUPPLY_QUALITY_PARAMETERS = [
  {
    code: 'MECHANICAL_DAMAGE',
    name: 'Mechanical damage',
    specification: '< 10%',
    defaultRemarks: 'Good',
  },
  {
    code: 'DISCOLORATION',
    name: 'Discoloration',
    specification: '< 1%',
    defaultRemarks: 'Good',
  },
  {
    code: 'DECAY',
    name: 'Decay',
    specification: 'None',
    defaultRemarks: 'Good',
  },
  {
    code: 'DEHYDRATION',
    name: 'Dehydration',
    specification: 'None',
    defaultRemarks: 'Good',
  },
  {
    code: 'SOIL',
    name: 'Soil',
    specification: 'None',
    defaultRemarks: 'Clean',
  },
  {
    code: 'INCORRECT_SIZING',
    name: 'Incorrect sizing',
    specification: 'Within tolerance',
    defaultRemarks: 'Good',
  },
  {
    code: 'INSECT_INFESTATION',
    name: 'Insect infestation',
    specification: 'None',
    defaultRemarks: 'None observed',
  },
  {
    code: 'VISUAL_MOULDS',
    name: 'Visual moulds',
    specification: 'None',
    defaultRemarks: 'Clean',
  },
  {
    code: 'MINERAL_CHEMICAL_DAMAGE',
    name: 'Mineral or chemical damages',
    specification: 'None',
    defaultRemarks: 'None',
  },
  {
    code: 'BLACK_SPOTS',
    name: 'Black spots',
    specification: 'None',
    defaultRemarks: 'Acceptable',
  },
  {
    code: 'FOREIGN_MATTER',
    name: 'Foreign matter',
    specification: 'None',
    defaultRemarks: 'None',
  },
  {
    code: 'PARTICLES_DUST',
    name: 'Particles & Dust',
    specification: '< 1%',
    defaultRemarks: 'Clean',
  },
  {
    code: 'SMALL_PIECES',
    name: 'Small pieces',
    specification: '< 1%',
    defaultRemarks: 'Good',
  },
  {
    code: 'TASTE',
    name: 'Taste',
    specification: 'Fresh / acceptable',
    defaultRemarks: 'Acceptable',
  },
  {
    code: 'SPROUTED_SEEDS',
    name: 'Sprouted seeds',
    specification: 'None',
    defaultRemarks: 'None',
  },
  {
    code: 'PACKAGING',
    name: 'Packaging',
    specification: 'Intact / proper labeling',
    defaultRemarks: 'Good',
  },
]

export const SUPPLY_QUALITY_SCORE_LEGEND = [
  {
    score: 3,
    meaning: 'Good – Meets quality standard',
  },
  {
    score: 2,
    meaning: 'Needs improvement',
  },
  {
    score: 1,
    meaning: 'Reject – Not acceptable',
  },
]


