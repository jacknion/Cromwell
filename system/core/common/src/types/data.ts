
import { ComponentType } from 'react';
import { TCommonComponentProps, TCromwellBlock, TCromwellBlockData } from './blocks'


export type TCromwellStore = {
    pluginsData?: Record<string, any>;
    pluginsSettings?: Record<string, any>;
    cmsconfig?: TCmsConfig;
    pageConfig?: TPageConfig;
    appCustomConfig?: Record<string, any>;
    appConfig?: TAppConfig;
    importPlugin?: (pluginName: string) => { default: ComponentType } | undefined;
    importDynamicPlugin?: (pluginName: string) => ComponentType | undefined;
    rebuildPage?: (path: string) => void;
    /** { [ComponentName]: (Class/function) } */
    components?: Record<string, React.ComponentType<TCommonComponentProps>>;
    /** { [CromwellBlockId]: Instance} */
    blockInstances?: Record<string, TCromwellBlock>;
    pagesInfo?: TPageInfo[];
    currency?: string;
    onCurrencyChange?: (currency: string) => void;
    graphQLClient?: any;
    restAPIClient?: any;
}

declare global {
    namespace NodeJS {
        interface Global {
            CromwellStore: TCromwellStore;
        }
    }
    interface Window {
        CromwellStore: TCromwellStore;
    }
}


export type TDBEntity = keyof {
    Post;
    Product;
    ProductCategory;
    ProductReview;
    Attribute;
}

export type GraphQLPathsType = { [K in TDBEntity]: TGraphQLNode };

export type TGraphQLNode = {
    getOneById: string;
    getOneBySlug?: string;
    getMany: string;
    create: string;
    update: string;
    delete: string;
}


export type TPagedList<Entity> = {
    pagedMeta?: TPagedMeta;
    elements?: Entity[];
}

export type TPagedParams<Entity> = {
    pageNumber?: number;
    pageSize?: number;
    orderBy?: keyof Entity;
    order?: 'ASC' | 'DESC';
}

export type TPagedMeta = {
    pageNumber?: number;
    pageSize?: number;
    totalPages?: number;
    totalElements?: number;
}

export type TCmsConfig = {
    apiPort: number;
    adminPanelPort: number;
    frontendPort: number;
    themeName: string;
    defaultPageSize: number;
    /** Array of available currencies: ['USD', 'EURO', ...] */
    currencyOptions?: string[];
    /** Object of local curency symbols that will be added to price in getPriceWithCurrency method: {"USD": "$","EURO": "€"}  */
    currencySymbols?: Record<string, string>;
    /** Ratio between currencies: {"USD": 1,"EURO": 0.8} */
    currencyRatio?: Record<string, number>;
}

export type TAppConfig = {
    /** Theme's pages dist dir  */
    pagesDir?: string;
    /** Colors to use */
    palette?: { primaryColor?: string };
    /** Custom HTML add into head of every page */
    headHtml?: string;
}

export type TThemeConfig = {
    pages: TPageConfig[];
    plugins: Record<string, {
        pages: string[];
        options: Record<string, any>;
    }>;
    appConfig: TAppConfig;
    /**
     * Custom config that will be available at every page in the Store inside pageConfig props
     */
    appCustomConfig?: Record<string, any>;
    globalModifications?: TCromwellBlockData[];
}

export type TPageInfo = {
    /** Path of page's react component */
    route: string;
    /** Name */
    name: string;
    /** SEO title */
    title?: string;
    /** SEO description */
    description?: string;
    /** Is using next.js dynamic routes? */
    isDynamic?: boolean;
}

export type TPageConfig = TPageInfo & {
    modifications: TCromwellBlockData[];
    pageCustomConfig: Record<string, any>;
}