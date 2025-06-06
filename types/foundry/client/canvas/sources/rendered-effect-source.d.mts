import Color from "@common/utils/color.mjs";
import { PointSourceMesh } from "../containers/_module.mjs";
import { PlaceableObject } from "../placeables/_module.mjs";
import { AbstractBaseShader, AdaptiveLightingShader } from "../rendering/shaders/_module.mjs";
import type BaseEffectSource from "./base-effect-source.mjs";
import type { BaseEffectSourceData } from "./base-effect-source.mjs";

interface RenderedEffectSourceData extends BaseEffectSourceData {
    /** A color applied to the rendered effect */
    color: number | null;
    /** An integer seed to synchronize (or de-synchronize) animations */
    seed: number | null;
    /** Is this source a temporary preview? */
    preview: boolean;
}

interface RenderedPointSourceAnimationConfig {
    /** The human-readable (localized) label for the animation */
    label?: string;
    /** The animation function that runs every frame */
    animation?: Function;
    /** A custom illumination shader used by this animation */
    illuminationShader?: PIXI.Shader;
    /** A custom coloration shader used by this animation */
    colorationShader?: PIXI.Shader;
    /** A custom background shader used by this animation */
    backgroundShader?: PIXI.Shader;
    /** A custom darkness shader used by this animation */
    darknessShader?: PIXI.Shader;
    /** The animation seed */
    seed?: number;
    /** The animation time */
    time?: number;
}

interface RenderedEffectLayerConfig {
    defaultShader: AdaptiveLightingShader;
    blendMode: PIXI.BLEND_MODES;
}

interface RenderedEffectSourceLayer {
    /** Is this layer actively rendered? */
    active: boolean;
    /** Do uniforms need to be reset? */
    reset: boolean;
    /** Is this layer temporarily suppressed? */
    suppressed: boolean;
    /** The rendered mesh for this layer */
    mesh: PointSourceMesh;
    /** The shader instance used for the layer */
    shader: PIXI.Shader;
}

/**
 * An abstract class which extends the base PointSource to provide common functionality for rendering.
 * This class is extended by both the LightSource and VisionSource subclasses.
 */
export default abstract class RenderedEffectSource<
    TObject extends PlaceableObject | null,
> extends BaseEffectSource<TObject> {
    /** Keys of the data object which require shaders to be re-initialized. */
    static _initializeShaderKeys: string[];

    /** Keys of the data object which require uniforms to be refreshed. */
    static _refreshUniformsKeys: string[];

    /**
     * Layers handled by this rendered source.
     */
    static get _layers(): Record<string, RenderedEffectLayerConfig>;

    /** The offset in pixels applied to create soft edges. */
    static EDGE_OFFSET: number;

    /* -------------------------------------------- */
    /*  Rendered Source Attributes                  */
    /* -------------------------------------------- */

    /** The animation configuration applied to this source */
    animation: RenderedPointSourceAnimationConfig;

    /** The object of data which configures how the source is rendered */
    data: RenderedEffectSourceData;

    /** Track the status of rendering layers */
    layers: Record<"background" | "coloration" | "illumination", RenderedEffectSourceLayer>;

    /** The color of the source as a RGB vector. */
    colorRGB: [number, number, number] | null;

    /* -------------------------------------------- */
    /*  Rendered Source Properties                  */
    /* -------------------------------------------- */

    /** A convenience accessor to the background layer mesh. */
    get background(): PointSourceMesh;

    /** A convenience accessor to the coloration layer mesh. */
    get coloration(): PointSourceMesh;

    /** A convenience accessor to the illumination layer mesh. */
    get illumination(): PointSourceMesh;

    /** Is the rendered source animated? */
    get isAnimated(): boolean;

    /** Has the rendered source at least one active layer? */
    get hasActiveLayer(): boolean;

    /** Is this RenderedPointSource a temporary preview? */
    get isPreview(): boolean;

    /* -------------------------------------------- */
    /*  Rendered Source Initialization              */
    /* -------------------------------------------- */

    protected override _initialize(data: Partial<BaseEffectSourceData>): void;

    /* -------------------------------------------- */

    /**
     * Decide whether to render soft edges with a blur.
     */
    protected _initializeSoftEdges(): void;

    protected override _configure(changes: object): void;

    /**
     * Configure which shaders are used for each rendered layer.
     * @returns An object whose keys are layer identifiers and whose values are shader classes.
     */
    protected _configureShaders(): Record<string, typeof AdaptiveLightingShader>;

    /** Decide whether to render soft edges with a blur. */
    protected _configureSoftEdges(): void;

    /**
     * Configure the derived color attributes and associated flag.
     * @param color The color to configure (usually a color coming for the rendered point source data)
     *              or null if no color is configured for this rendered source.
     */
    protected _configureColorAttributes(color: number | null): void;

    /** Specific configuration for a layer. */
    protected _configureLayer(layer: RenderedEffectSourceLayer, layerId: string): void;

    /* -------------------------------------------- */
    /*  Rendered Source Canvas Rendering            */
    /* -------------------------------------------- */

    /**
     * Create the geometry for the source shape that is used in shaders and compute its bounds for culling purpose.
     * Triangulate the form and create buffers.
     */
    protected abstract _updateGeometry(): void;

    /** Render the containers used to represent this light source within the LightingLayer */
    drawMeshes(): Record<"background" | "coloration" | "illumination", PIXI.Mesh>;

    /* -------------------------------------------- */
    /*  Rendered Source Refresh                     */
    /* -------------------------------------------- */

    protected override _refresh(): void;

    /** Update shader uniforms used by every rendered layer. */
    protected _updateCommonUniforms(shader: AbstractBaseShader): void;

    /** Update shader uniforms used for the background layer. */
    protected _updateBackgroundUniforms(): void;

    /** Update shader uniforms used for the coloration layer. */
    protected _updateColorationUniforms(): void;

    /** Update shader uniforms used for the illumination layer. */
    protected _updateIlluminationUniforms(): void;

    /* -------------------------------------------- */
    /*  Rendered Source Destruction                 */
    /* -------------------------------------------- */

    protected override _destroy(): void;

    /* -------------------------------------------- */
    /*  Animation Functions                         */
    /* -------------------------------------------- */

    /**
     * Animate the PointSource, if an animation is enabled and if it currently has rendered containers.
     * @param dt Delta time.
     */
    animate(dt: number): void;

    /**
     * Generic time-based animation used for Rendered Point Sources.
     * @param dt Delta time.
     * @param [options]               Options which affect the time animation
     * @param [options.speed=5]       The animation speed, from 1 to 10
     * @param [options.intensity=5]   The animation intensity, from 1 to 10
     * @param [options.reverse=false] Reverse the animation direction
     */
    animateTime(dt: number, options?: { speed?: number; intensity?: number; reverse?: boolean }): void;

    /* -------------------------------------------- */
    /*  Static Helper Methods                       */
    /* -------------------------------------------- */

    /**
     * Get corrected level according to level and active vision mode data.
     * @returns {number} The corrected level.
     */
    static getCorrectedLevel(level: number): number;

    /** Get corrected color according to level, dim color, bright color and background color. */
    static getCorrectedColor(level: number, colorDim: Color, colorBright: Color, colorBackground?: Color): Color;
}
