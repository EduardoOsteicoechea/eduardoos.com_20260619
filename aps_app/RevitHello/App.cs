using System.Text;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using DesignAutomationFramework;

namespace RevitHello;

public class App : IExternalDBApplication
{
    public ExternalDBApplicationResult OnStartup(ControlledApplication application)
    {
        DesignAutomationBridge.DesignAutomationReadyEvent += OnDesignAutomationReady;
        return ExternalDBApplicationResult.Succeeded;
    }

    public ExternalDBApplicationResult OnShutdown(ControlledApplication application)
    {
        return ExternalDBApplicationResult.Succeeded;
    }

    private void OnDesignAutomationReady(object? sender, DesignAutomationReadyEventArgs e)
    {
        try
        {
            e.Succeeded = Run(e.DesignAutomationData);
        }
        catch (Exception ex)
        {
            try
            {
                File.WriteAllText(
                    Path.Combine(Directory.GetCurrentDirectory(), "result.json"),
                    "{\"ok\":false,\"error\":\"" + Escape(ex.GetType().Name + ": " + ex.Message) + "\"}"
                );
            }
            catch
            {
            }
            e.Succeeded = false;
        }
    }

    private static bool Run(DesignAutomationData data)
    {
        if (data == null)
        {
            throw new InvalidOperationException("DesignAutomationData is null");
        }

        Document? doc = data.RevitDoc;
        if (doc == null)
        {
            string path = data.FilePath ?? "";
            throw new InvalidOperationException("RevitDoc is null; filePath=" + path);
        }

        int walls = SafeCount(doc, BuiltInCategory.OST_Walls);
        int doors = SafeCount(doc, BuiltInCategory.OST_Doors);
        int windows = SafeCount(doc, BuiltInCategory.OST_Windows);
        int floors = SafeCount(doc, BuiltInCategory.OST_Floors);
        int rooms = SafeCount(doc, BuiltInCategory.OST_Rooms);
        int levels = SafeClassCount(doc, typeof(Level));
        int views = SafeClassCount(doc, typeof(View));
        int sheets = SafeClassCount(doc, typeof(ViewSheet));

        string projectName = "";
        string projectNumber = "";
        try
        {
            ProjectInfo? info = doc.ProjectInformation;
            if (info != null)
            {
                projectName = info.Name ?? "";
                projectNumber = info.Number ?? "";
            }
        }
        catch
        {
        }

        var sb = new StringBuilder();
        sb.Append('{');
        sb.Append("\"ok\":true,");
        sb.Append("\"extractedAtUtc\":\"").Append(Escape(DateTime.UtcNow.ToString("o"))).Append("\",");
        sb.Append("\"title\":\"").Append(Escape(doc.Title ?? "")).Append("\",");
        sb.Append("\"pathName\":\"").Append(Escape(doc.PathName ?? "")).Append("\",");
        sb.Append("\"isFamilyDocument\":").Append(doc.IsFamilyDocument ? "true" : "false").Append(',');
        sb.Append("\"project\":{");
        sb.Append("\"name\":\"").Append(Escape(projectName)).Append("\",");
        sb.Append("\"number\":\"").Append(Escape(projectNumber)).Append('"');
        sb.Append("},");
        sb.Append("\"counts\":{");
        sb.Append("\"walls\":").Append(walls).Append(',');
        sb.Append("\"doors\":").Append(doors).Append(',');
        sb.Append("\"windows\":").Append(windows).Append(',');
        sb.Append("\"floors\":").Append(floors).Append(',');
        sb.Append("\"rooms\":").Append(rooms).Append(',');
        sb.Append("\"levels\":").Append(levels).Append(',');
        sb.Append("\"views\":").Append(views).Append(',');
        sb.Append("\"sheets\":").Append(sheets);
        sb.Append("}}");

        string outPath = Path.Combine(Directory.GetCurrentDirectory(), "result.json");
        File.WriteAllText(outPath, sb.ToString(), Encoding.UTF8);
        return File.Exists(outPath);
    }

    private static int SafeCount(Document doc, BuiltInCategory category)
    {
        try
        {
            return new FilteredElementCollector(doc)
                .OfCategory(category)
                .WhereElementIsNotElementType()
                .ToElementIds()
                .Count;
        }
        catch
        {
            return -1;
        }
    }

    private static int SafeClassCount(Document doc, Type type)
    {
        try
        {
            return new FilteredElementCollector(doc).OfClass(type).ToElementIds().Count;
        }
        catch
        {
            return -1;
        }
    }

    private static string Escape(string value)
    {
        return value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\r", "\\r")
            .Replace("\n", "\\n")
            .Replace("\t", "\\t");
    }
}
