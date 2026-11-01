import { HeroLandscape } from './HeroLandscape'

/**
 * The illustrated watercolor landscape of the rural school grounds.
 * Expands naturally across the hero, creating an immersive storybook scene.
 */
export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-2xl lg:max-w-3xl xl:mx-0 xl:w-auto xl:max-w-none">
      <div className="-mx-4 sm:mx-0">
        <HeroLandscape className="landscape-fade" />
      </div>
    </div>
  )
}

