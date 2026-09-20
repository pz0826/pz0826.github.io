export interface Work {
  id: string;
  title: string;
  authors: string;
  venue: string;
  theme: string;
  summary: string;
  poster: string;
  video?: string;
  links: { label: string; href: string }[];
}
export const works: Work[] = [
  {
    id: 'lifeplanner',
    title:
      'LifePlanner: Evaluating LLM Agents for Geo-spatial Planning with Social Media Data',
    authors:
      'Zhen Dong*, Yuning Peng*, Yutao Shi, Lei Zhong, Yongsen Mao, Yuan Liu, Haiping Wang†',
    venue: 'arXiv 2026',
    theme: 'Spatial agents',
    summary:
      'A benchmark that connects maps with local social-media evidence to evaluate LLM agents across four geo-spatial planning tasks and three difficulty levels.',
    poster: 'LifePlanner-poster.png',
    video: 'LifePlanner-video.mp4',
    links: [{ label: 'Paper', href: 'https://arxiv.org/abs/2608.25039' }],
  },
  {
    id: 'lego',
    title: 'LEGO: Leveled Language Gaussian Splatting',
    authors:
      'Yuning Peng, Haiping Wang, Yuan Liu, Yipeng Lu, Zhen Dong, Bisheng Yang',
    venue: 'ECCV 2026',
    theme: 'Hierarchical scene understanding',
    summary:
      'Understanding a scene from objects to their parts: a leveled 3D representation for open-vocabulary and relational queries.',
    poster: 'LEGO-poster.webp',
    video: 'LEGO-video.mp4',
    links: [
      { label: 'Paper', href: 'https://arxiv.org/abs/2608.10057' },
      { label: 'Project', href: 'https://pz0826.github.io/LEGO-Webpage/' },
      { label: 'Code', href: 'https://github.com/WHU-USI3DV/LEGO' },
    ],
  },
  {
    id: 'gags',
    title:
      'GAGS: Granularity-Aware 3D Feature Distillation for Gaussian Splatting',
    authors:
      'Yuning Peng*, Haiping Wang*, Yuan Liu, Chenglu Wen, Zhen Dong, Bisheng Yang',
    venue: 'AAAI 2026',
    theme: 'Open-vocabulary 3D vision',
    summary:
      'Distilling 2D CLIP features into Gaussian splatting with adaptive granularity, enabling open-vocabulary queries from arbitrary viewpoints.',
    poster: 'GAGS-poster.png',
    video: 'GAGS-video.mp4',
    links: [
      { label: 'Paper', href: 'https://arxiv.org/abs/2412.13654' },
      { label: 'Project', href: 'https://pz0826.github.io/GAGS-Webpage/' },
      { label: 'Code', href: 'https://github.com/WHU-USI3DV/GAGS' },
    ],
  },
  {
    id: 'neural-city',
    title:
      'The Neural City: A Next-generation Spatio-Temporal Intelligence Paradigm for Urban Holistic Governance',
    authors:
      'Zhen Dong, Haiping Wang, Zhe Chen, Chen Long, Yuning Peng, Yuan Liu, Fuxun Liang, Jian Zhou, Yiping Chen, Fan Zhang, Bisheng Yang†, Deren Li',
    venue: 'The Innovation 2025',
    theme: 'Spatial intelligence systems',
    summary:
      'A framework connecting raw urban observations with holistic urban governance through the “6W+4R” paradigm.',
    poster: 'Neural_City-poster.png',
    links: [
      {
        label: 'Paper',
        href: 'https://www.sciencedirect.com/science/article/pii/S2666675825003522',
      },
    ],
  },
  {
    id: 'forest',
    title:
      'Fine-Resolution Forest Height Estimation by Integrating ICESat-2 and Landsat 8 OLI Data with a Spatial Downscaling Method for Aboveground Biomass Quantification',
    authors: 'Yingxuan Wang*, Yuning Peng*, Xudong Hu, Penglin Zhang',
    venue: 'Forests 2023',
    theme: 'Remote sensing',
    summary:
      'Mapping forest height and aboveground biomass at 15-m resolution by combining satellite imagery and spaceborne LiDAR.',
    poster: 'Forest_poster2.png',
    links: [
      { label: 'Paper', href: 'https://www.mdpi.com/1999-4907/14/7/1414' },
    ],
  },
];
