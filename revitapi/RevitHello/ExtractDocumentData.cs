using System.Text;
using Autodesk.Revit.DB;

namespace RevitHello;

public class ExtractDocumentData
{
    Document Doc;

    public ExtractDocumentData(Document document)
    {
        Doc = document;
    }

    public ExtractDocumentDataDto Extract()
    {
        return new ExtractDocumentDataDto
        {
            Title = Doc.Title ?? "",
            FileSizeBytes = ResolveFileSizeBytes(),
            LastUpdateUtc = ResolveLastUpdateUtc(),
            WallIds = CollectIds(BuiltInCategory.OST_Walls),
            FloorIds = CollectIds(BuiltInCategory.OST_Floors),
            DoorIds = CollectIds(BuiltInCategory.OST_Doors),
            WindowIds = CollectIds(BuiltInCategory.OST_Windows),
            RoofIds = CollectIds(BuiltInCategory.OST_Roofs),
            RoomIds = CollectIds(BuiltInCategory.OST_Rooms),
        };
    }

    List<string> CollectIds(BuiltInCategory category)
    {
        try
        {
            return new FilteredElementCollector(Doc)
                .OfCategory(category)
                .WhereElementIsNotElementType()
                .ToElementIds()
                .Select(id => id.Value.ToString())
                .ToList();
        }
        catch
        {
            return new List<string>();
        }
    }

    long ResolveFileSizeBytes()
    {
        try
        {
            string path = Doc.PathName ?? "";
            if (path.Length > 0 && File.Exists(path))
            {
                return new FileInfo(path).Length;
            }
        }
        catch
        {
        }
        return 0;
    }

    string ResolveLastUpdateUtc()
    {
        try
        {
            string path = Doc.PathName ?? "";
            if (path.Length > 0 && File.Exists(path))
            {
                return new FileInfo(path).LastWriteTimeUtc.ToString("o");
            }
        }
        catch
        {
        }
        return "";
    }
}

public class ExtractDocumentDataDto
{
    public string Title { get; set; } = "";
    public long FileSizeBytes { get; set; }
    public string LastUpdateUtc { get; set; } = "";
    public List<string> WallIds { get; set; } = new();
    public List<string> FloorIds { get; set; } = new();
    public List<string> DoorIds { get; set; } = new();
    public List<string> WindowIds { get; set; } = new();
    public List<string> RoofIds { get; set; } = new();
    public List<string> RoomIds { get; set; } = new();

    public ExtractDocumentDataObservable ToObservableObject()
    {
        return new ExtractDocumentDataObservable
        {
            Title = Title ?? "",
            FileSizeBytes = FileSizeBytes,
            LastUpdateUtc = LastUpdateUtc ?? "",
            Walls = WallIds?.ToList() ?? new List<string>(),
            Floors = FloorIds?.ToList() ?? new List<string>(),
            Doors = DoorIds?.ToList() ?? new List<string>(),
            Windows = WindowIds?.ToList() ?? new List<string>(),
            Roofs = RoofIds?.ToList() ?? new List<string>(),
            Rooms = RoomIds?.ToList() ?? new List<string>(),
        };
    }
}

public class ExtractDocumentDataObservable
{
    public string Title { get; set; } = "";
    public long FileSizeBytes { get; set; }
    public string LastUpdateUtc { get; set; } = "";
    public List<string> Walls { get; set; } = new();
    public List<string> Floors { get; set; } = new();
    public List<string> Doors { get; set; } = new();
    public List<string> Windows { get; set; } = new();
    public List<string> Roofs { get; set; } = new();
    public List<string> Rooms { get; set; } = new();

    public string ToJson()
    {
        var sb = new StringBuilder();
        sb.Append('{');
        sb.Append("\"title\":\"").Append(Escape(Title)).Append("\",");
        sb.Append("\"fileSizeBytes\":").Append(FileSizeBytes).Append(',');
        sb.Append("\"lastUpdateUtc\":\"").Append(Escape(LastUpdateUtc)).Append("\",");
        sb.Append("\"walls\":").Append(StringList(Walls)).Append(',');
        sb.Append("\"floors\":").Append(StringList(Floors)).Append(',');
        sb.Append("\"doors\":").Append(StringList(Doors)).Append(',');
        sb.Append("\"windows\":").Append(StringList(Windows)).Append(',');
        sb.Append("\"roofs\":").Append(StringList(Roofs)).Append(',');
        sb.Append("\"rooms\":").Append(StringList(Rooms));
        sb.Append('}');
        return sb.ToString();
    }

    static string StringList(List<string> values)
    {
        var sb = new StringBuilder();
        sb.Append('[');
        for (int i = 0; i < values.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append('"').Append(Escape(values[i] ?? "")).Append('"');
        }
        sb.Append(']');
        return sb.ToString();
    }

    static string Escape(string value)
    {
        return value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\r", "\\r")
            .Replace("\n", "\\n")
            .Replace("\t", "\\t");
    }
}
