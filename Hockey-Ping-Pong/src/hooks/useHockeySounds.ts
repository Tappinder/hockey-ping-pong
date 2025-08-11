export function useHockeySounds() {
  const play = (src: string) => {
    const audio = new Audio(src);
    audio.play();
  };

  return {
    hit: () => play('/sounds/hit.wav'),
    wall: () => play('/sounds/wall.wav'),
    goal: () => play('/sounds/goal.wav'),
  };
}
