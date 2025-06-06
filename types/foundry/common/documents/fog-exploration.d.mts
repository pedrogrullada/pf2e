import { ImageFilePath } from "@common/constants.mjs";
import { DatabaseUpdateCallbackOptions, Document, DocumentMetadata } from "../abstract/_module.mjs";
import * as fields from "../data/fields.mjs";
import { BaseScene, BaseUser } from "./_module.mjs";

/**
 * The Document definition for FogExploration.
 * Defines the DataSchema and common behaviors for FogExploration which are shared between both client and server.
 * @memberof documents
 *
 * @param data    Initial data from which to construct the FogExploration
 * @param context Construction context options
 */
export default class BaseFogExploration extends Document<null, FogExplorationSchema> {
    static override get metadata(): FogExplorationMetadata;

    static override defineSchema(): FogExplorationSchema;

    protected override _preUpdate(
        changed: DeepPartial<this["_source"]>,
        options: DatabaseUpdateCallbackOptions,
        user: BaseUser,
    ): Promise<boolean | void>;
}

export default interface BaseFogExploration
    extends Document<null, FogExplorationSchema>,
        fields.ModelPropsFromSchema<FogExplorationSchema> {
    get documentName(): FogExplorationMetadata["name"];
}

interface FogExplorationMetadata extends DocumentMetadata {
    name: "FogExploration";
    collection: "fog";
    label: "DOCUMENT.FogExploration";
    labelPlural: "DOCUMENT.FogExplorations";
    isPrimary: true;
}

type FogExplorationSchema = {
    /** The _id which uniquely identifies this FogExploration document */
    _id: fields.DocumentIdField;
    /** The _id of the Scene document to which this fog applies */
    scene: fields.ForeignDocumentField<BaseScene>;
    /** The _id of the User document to which this fog applies */
    user: fields.ForeignDocumentField<BaseUser>;
    /** The base64 png image of the explored fog polygon */
    explored: fields.FilePathField<ImageFilePath, ImageFilePath, true>;
    /** The object of scene positions which have been explored at a certain vision radius */
    positions: fields.ObjectField<object>;
    /** The timestamp at which this fog exploration was last updated */
    timestamp: fields.NumberField<number, number, false, true, true>;
    flags: fields.DocumentFlagsField;
};

export type FogExplorationSource = fields.SourceFromSchema<FogExplorationSchema>;
