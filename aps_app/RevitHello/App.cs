using System.Text.Json;
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
        e.Succeeded = Run(e.DesignAutomationData);
    }

    private static bool Run(DesignAutomationData data)
    {
        if (data == null)
        {
            return false;
        }

        Document? doc = data.RevitDoc;
        if (doc == null)
        {
            return false;
        }

        var summary = new Dictionary<string, object?>
        {
            ["extractedAtUtc"] = DateTime.UtcNow.ToString("o"),
            ["title"] = doc.Title,
            ["pathName"] = doc.PathName,
            ["isFamilyDocument"] = doc.IsFamilyDocument,
            ["counts"] = new Dictionary<string, int>
            {
                ["walls"] = Count(doc, BuiltInCategory.OST_Walls),
                ["doors"] = Count(doc, BuiltInCategory.OST_Doors),
                ["windows"] = Count(doc, BuiltInCategory.OST_Windows),
                ["floors"] = Count(doc, BuiltInCategory.OST_Floors),
                ["rooms"] = Count(doc, BuiltInCategory.OST_Rooms),
                ["levels"] = new FilteredElementCollector(doc).OfClass(typeof(Level)).GetElementCount(),
                ["views"] = new FilteredElementCollector(doc).OfClass(typeof(View)).GetElementCount(),
                ["sheets"] = new FilteredElementCollector(doc).OfClass(typeof(ViewSheet)).GetElementCount(),
            },
        };

        ProjectInfo? info = doc.ProjectInformation;
        if (info != null)
        {
            summary["project"] = new Dictionary<string, string?>
            {
                ["name"] = info.Name,
                ["number"] = info.Number,
                ["address"] = info.Address,
                ["clientName"] = info.ClientName,
                ["buildingName"] = info.BuildingName,
                ["author"] = info.Author,
            };
        }

        string outPath = Path.Combine(Directory.GetCurrentDirectory(), "result.json");
        string json = JsonSerializer.Serialize(summary, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(outPath, json);
        return File.Exists(outPath);
    }

    private static int Count(Document doc, BuiltInCategory category)
    {
        return new FilteredElementCollector(doc)
            .OfCategory(category)
            .WhereElementIsNotElementType()
            .GetElementCount();
    }
}
