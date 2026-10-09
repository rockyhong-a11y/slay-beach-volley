// Character identities and artwork are preserved from rockyhong-a11y/slay.
// Volleyball abilities are new, sport-specific game balance.
export const ROSTER = [
  { id: 'nova', name: 'NOVA', ko: '노바', color: '#79a8da', role: '올라운드 에이스', power: 4, speed: 5, jump: 4, skill: '플래시 스파이크', description: '빠른 발과 균형 잡힌 점프. 첫 경기부터 가볍게.' },
  { id: 'raven', name: 'RAVEN', ko: '레이븐', color: '#e54b59', role: '파워 스파이커', power: 5, speed: 3, jump: 4, skill: '레드라인 강타', description: '네트 앞에서 터지는 한 방. 짧고 강한 공격.' },
  { id: 'valkyrie', name: 'VALKYRIE', ko: '발키리', color: '#dbb970', role: '네트의 수호자', power: 4, speed: 3, jump: 5, skill: '아이언 블록', description: '높은 타점으로 네트를 지켜요. 공 앞에 정확히 서야 블록 성공.' },
  { id: 'viper', name: 'VIPER', ko: '바이퍼', color: '#9fbe65', role: '코너 스페셜리스트', power: 4, speed: 5, jump: 3, skill: '프리시전 샷', description: '빠르게 빈 공간을 찾아 코너로 꽂는 정교한 공격.' },
  { id: 'ember', name: 'EMBER', ko: '엠버', color: '#e6a958', role: '컴백 챔피언', power: 5, speed: 4, jump: 3, skill: '버닝 스파이크', description: '묵직한 스파이크와 끈질긴 수비로 흐름을 바꿔요.' },
  { id: 'atlas', name: 'ATLAS', ko: '아틀라스', color: '#dc9366', role: '코트의 타이탄', power: 5, speed: 2, jump: 5, skill: '타이탄 스매시', description: '높게 뛰어올라 힘으로 밀어붙이는 압도적인 타점.' },
  { id: 'seraph', name: 'SERAPH', ko: '세라프', color: '#73aedb', role: '스카이 에이스', power: 3, speed: 4, jump: 5, skill: '스카이 다이브', description: '긴 체공 시간으로 공이 내려오는 순간을 기다려요.' },
  { id: 'lynx', name: 'LYNX', ko: '링스', color: '#b995d4', role: '리시브 헌터', power: 3, speed: 5, jump: 4, skill: '퀵 클로', description: '누구보다 먼저 공 아래로. 민첩한 수비의 전문가.' },
  { id: 'tempest', name: 'TEMPEST', ko: '템페스트', color: '#64bca2', role: '템포 메이커', power: 4, speed: 4, jump: 4, skill: '스톰 러시', description: '공수 전환이 빠른 선수. 리듬을 타면 더 강해져요.' },
  { id: 'onyx', name: 'ONYX', ko: '오닉스', color: '#8f89c8', role: '카운터 센티널', power: 4, speed: 3, jump: 5, skill: '섀도 카운터', description: '차분하게 받아내고 높은 점프로 빈틈을 노려요.' },
];
export const characterFor = id => ROSTER.find(character => character.id === id) || ROSTER[0];
export const COURTS = [
  { name: '코랄 비치', en: 'CORAL BEACH', tag: '파도와 함께, 첫 번째 랠리', sky: '#a5dce4', sea: '#41b9bb', sand: '#f0d6a6', accent: '#116f66', evening: false },
  { name: '선셋 코브', en: 'SUNSET COVE', tag: '노을 아래, 더 뜨거운 승부', sky: '#f3b397', sea: '#8ebdb8', sand: '#eac092', accent: '#cb654b', evening: true },
  { name: '문라이트 베이', en: 'MOONLIGHT BAY', tag: '별빛 아래, 마지막 한 방', sky: '#384a68', sea: '#397d8e', sand: '#beb7a3', accent: '#6c81ba', evening: true, night: true },
];
