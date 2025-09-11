import type {ColumnType} from "typeorm";

export function isStringType(columnType: ColumnType): boolean {
    const stringTypes = ['varchar', 'char', 'text', 'string', 'nvarchar', 'nchar', 'ntext'];
    const typeStr = String(columnType).toLowerCase();
    return stringTypes.some(type => typeStr.includes(type));
}

export function convertValueToString(value: any): string {
    if (value === null || value === undefined) {
        return '';
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }
    return String(value);
}


export function truncateText(text: string, maxLength: number=1024): string {
    return text.length <= maxLength ? text : text.substring(0, maxLength - 3) + '...';
}
