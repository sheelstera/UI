$.trace.debug("CEP Rest Services with XSJS Starts");


//checking

//Import statements
var errorHandler = $.import("cepcore.services", "ErrorHandler");
var utilsLib = $.import("cepcore.services", "utilsLib");
var XSProc = $.import("sap.hana.xs.libs.dbutils", "procedures");

//Creating connection variable and setting temporary values
var connection = $.db.getConnection($.db.isolation.SERIALIZABLE);
XSProc.setTempSchema($.session.getUsername().toUpperCase());
var CepBackPack = null;
var req = null;

//Enum for metadata inputs
var metadataEnum = {
    "table": "TABLE",
    "input": "INPUT_FORMAT",
    "output": "OUTPUT_FORMAT",
    "both": "BOTH"
}

//Function for passing parameter and headers from source to target for outbound request
    function prepareHeadersParameters(source, target) {
        $.trace.debug("Parameters Called with " + source.parameters.length + " values");
        var i = 0;
        for (i = 0; i < source.parameters.length; i++) {
            target.parameters.set(source.parameters[i].name, source.parameters[i].value);
        }
        $.trace.debug("Headers Called with " + source.headers.length + " values");
        for (i = 0; i < source.headers.length; i++) {
            target.headers.set(source.headers[i].name, source.headers[i].value);
        }
    }

    //Making outbound request to specified fileapidest file. 
    function makeOutBoundRequest(XMLContent) {
        //OutBound call
        var dest = $.net.http.readDestination("cepcore.services", "fileapidest");
        var client = new $.net.http.Client();

        req.setBody(XMLContent);
        client.request(req, dest);
        var response = client.getResponse();
    }


    // Function to handle the Calls which are coming with GET method
    function handleGet() {
        $.trace.debug("In Get Method");
        // Parameters that can come in CepBackPack and their default values
        var metadata = false;
        var metadataForMethod = 'GET';
        var service = 'ALL';
        var path = '/';
        var i = 0;

        //For Path 
        if (typeof oCepBackPack.path !== 'undefined') {
            path = oCepBackPack.path; // Fetch metadata
        }

        var len = path.length;
        var index = path.lastIndexOf("/");
        //	var tempservice=paramName.substring(index+1, len);

        path = path.substring(0, index + 1);


        // Code for calculating Path Ends

        if (typeof oCepBackPack.metadata !== 'undefined') {
            metadata = oCepBackPack.metadata; // Fetch metadata
            if (typeof oCepBackPack.operation !== 'undefined') {
                metadataForMethod = oCepBackPack.operation;
            }
        }

        if (typeof oCepBackPack.path !== 'undefined' && oCepBackPack.path === '/') {
            path = '/'; // 
        } else if (typeof oCepBackPack.path !== 'undefined') {
            path = oCepBackPack.path;
        }

        if (typeof oCepBackPack.service !== 'undefined' && oCepBackPack.service === 'ALL') {
            service = 'ALL';
        } else if (typeof oCepBackPack.service !== 'undefined') {
            service = oCepBackPack.service;
        }


        $.trace.debug("Serice _name is:" + service);
        // Code to call the service
        var stmt = connection.prepareStatement("select schema_name,procedure_name,enabled,method_type,base_table from cep_core.cepmm_services where service_uri like '" + path + "%' and service_name='" + service + "' and method_type=(case when service_type='CEPFunctionality' then 'POST' else '" + metadataForMethod + "' end)");
        var rs = stmt.executeQuery();
        var proc_name = ''; // Specifying the procedure for that table
        var schema_name = '';
        var method_type = '';
        var base_table = '';
        while (rs.next()) {
            $.trace.debug("Schema_name is:" + rs.getString(1) + " Procedure Name is:" + rs.getString(2) + " Enabled is:" + rs.getString(3));
            proc_name = rs.getString(2); // Specifying the procedure for that table
            schema_name = rs.getString(1);
            method_type = rs.getString(4);
            base_table = rs.getString(5);
        }
        if (proc_name === '' && service !== 'ALL') {
            errorHandler.fProcessException('NOT_AVAILABLE', ['Service "' + service + '" not available']);
            return;
        }

        if (metadata !== false) {
            if (service === 'ALL') {
                errorHandler.fProcessException('NOT_IMPLEMENTED', ['Fetching metadata for All services']);

            } else {
                if (metadata === "table") {
                    var procedure = XSProc.procedureOfSchema("CEP_CORE", "CEPSERVICE_READ_METADATA");
                    var updateData = {
                        "TABLE_NAME": base_table
                    };
                    var out = procedure(updateData, connection);

                    stmt.close();
                    // $.trace.debug("OutPut is:"+JSON.stringify(out));
                    utilsLib.doResponse(200, JSON.stringify(out.OUTPUT));
                } else {
                    var template_type = eval("metadataEnum." + metadata);
                    var procedure = XSProc.procedureOfSchema('CEP_CORE', "CEPSERVICES_GENERATE_TEMPLATE");
                    var updateData = {
                        "TYPE": template_type,
                        "SCHEMA_NAME": schema_name,
                        "TABLE_NAME": "",
                        "PROCEDURE_NAME": proc_name
                    };
                    var out = procedure(updateData, connection);

                    stmt.close();
                    //  $.trace.debug("OutPut is:"+JSON.stringify(out));
                    utilsLib.doResponse(200, out.OUTPUT);

                    // utilsLib.doResponse(200,template_type);
                }
            }
        } else if (method_type !== 'GET' && service !== 'ALL') {
            errorHandler.fProcessException('METHOD_NOT_SUPPORTED', [$.request.method.toString()]); //Service not supported with this method
            return;
        } else if (service === 'ALL') {
            var procedure = XSProc.procedureOfSchema('CEP_CORE', "CEPSERVICES_READ_SERVICES");
            path = path + '%';
            var updateData = {
                "PATH": path
            };
            var out = procedure(updateData, connection);

            stmt.close();
            //  $.trace.debug("OutPut is:"+JSON.stringify(out));
            utilsLib.doResponse(200, JSON.stringify(out.OUTPUT));
        } else if (service !== 'ALL') {

            var procedure = XSProc.procedureOfSchema(schema_name, proc_name);

            var column_name = $.request.parameters.get("column_name");
            var column_value = $.request.parameters.get("column_value");
            var iv_entity = $.request.parameters.get("iv_entity");

            var entity_name = $.request.parameters.get("ENTITY_NAME");
            var attribute_name = $.request.parameters.get("ATTRIBUTE_NAME");


            var procedure_type = $.request.parameters.get("PROCEDURE_TYPE");

            if (typeof column_name !== 'undefined') {
                var updateData = {
                    "COLUMN_NAME": column_name,
                    "COLUMN_VALUE": column_value
                };
            } else if (typeof iv_entity !== 'undefined') {
                var updateData = {
                    "IV_ENTITY": iv_entity
                };
            } else if (typeof entity_name !== 'undefined') {
                var updateData = {
                    "ENTITY_NAME": entity_name,
                    "ATTRIBUTE_NAME": attribute_name
                };
            } else if (typeof procedure_type !== 'undefined') {
                $.trace.debug("Type:" + procedure_type);
                var arr = procedure_type.split(",");
                var arrjson = [];

                for (var i = 0; i < arr.length; i++) {
                    var arrObj = new Object();
                    arrObj.PROCEDURE_TYPE = arr[i];
                    arrjson.push(arrObj);
                }
                //   $.trace.debug("arrjson:"+arrjson);
                // arrjson=JSON.parse(arrjson);
                var updateData = {
                    "PROCEDURE_TYPES": arrjson
                };
            } else {
                var updateData = {};
            }



            var out = procedure(updateData, connection);

            stmt.close();
            //  $.trace.debug("OutPut is:"+JSON.stringify(out));
            utilsLib.doResponse(200, JSON.stringify(out.OUTPUT));
        } else {
            errorHandler.fProcessException('METHOD_NOT_SUPPORTED', [$.request.method.toString()]); //Service not supported with this method
        }
    }

    function handlePost() {
        var rs = null;
        var args = null;
        var service = '';
        var path = '/';

        $.trace.debug("In Post Method");
        if (typeof oCepBackPack.metadata !== 'undefined') {
            errorHandler.fProcessException('METHOD_NOT_SUPPORTED', ['Post method not supported for metadata']);
            return;
        }

        if (typeof oCepBackPack.path !== 'undefined' && oCepBackPack.path === '/') {
            path = '/'; // 
        } else if (typeof oCepBackPack.path !== 'undefined') {
            path = oCepBackPack.path;
        }


        if (typeof oCepBackPack.service !== 'undefined') {
            service = oCepBackPack.service; // Fetch metadata
        }

        $.trace.debug("Serice _name is:" + service);
        $.trace.debug("Before service:" + Date());
        var stmt = connection.prepareStatement("select schema_name,procedure_name,enabled from CEP_CORE.cepmm_services where service_name='" + service + "' and method_type='POST'");
        var rs = stmt.executeQuery();
        $.trace.debug("After service:" + Date());
        var proc_name = ''; // Specifying the procedure for that table
        var schema_name = '';
        while (rs.next()) {
            $.trace.debug("Schema_name is:" + rs.getString(1) + " Procedure Name is:" + rs.getString(2) + " Enabled is:" + rs.getString(3));
            proc_name = rs.getString(2); // Specifying the procedure for that table
            schema_name = rs.getString(1);
        }
        if (proc_name === '') {
            errorHandler.fProcessException('NOT_AVAILABLE', ['Service "' + service + '" not available']);
            return;
        } else if (service === 'GenerateArtifact') {
            $.trace.debug("Before Artifact:" + Date());
            var procedure = XSProc.procedureOfSchema(schema_name, proc_name);
            // var procedure = XSProc.procedureOfSchema("CEP_CORE", "CEPREPO_ACTIVATION");
            $.trace.debug("Before Artifact1:" + Date());
            var updateData = JSON.parse($.request.body.asString());

            $.trace.debug("Before Artifact2:" + Date());
            var out = procedure(updateData, connection);
            $.trace.debug("After Artifact:" + Date());
            stmt.close();


            if (updateData.TYPE === 'Artifact' || updateData.TYPE === 'Full') {
                var query = "select artifact_name from CEP_CORE.cepaf_content order by artifact_type desc";
                getAndActivateArtifact(query);
            } else if (updateData.TYPE === 'change_log') {
                var query = "select node from CEP_CORE.OBJECT_LIST where object_type='VIEW' and package='cepcore.views'";
                getAndActivateArtifact(query);
            } else if (updateData.TYPE === 'Entity') {
                var query = "select artifact_name from CEP_CORE.cepaf_content where artifact_name is null";
            }



        } else if (service.indexOf('Prediction') !== -1) {
            if (service === 'Prediction') {
                var procedure = XSProc.procedureOfSchema("TEST_SCHEMA2", "CEP_PREDICTION_ALGO");
                var updateData = JSON.parse($.request.body.asString());
                var out = procedure(updateData, connection);
            } else if (service === 'PredictionSetup') {
                var procedure = XSProc.procedureOfSchema("TEST_SCHEMA2", "CEP_KMEANS_INTIALSETUP");
                var updateData = {};
                var out = procedure(updateData, connection);
            } else if (service === 'PredictionCluster') {
                var procedure = XSProc.procedureOfSchema("TEST_SCHEMA2", "CEP_KMEANS_CREATE_CLUSTER");
                var updateData = {};
                var out = procedure(updateData, connection);
            } else if (service === 'PredictionWrapper') {
                var procedure = XSProc.procedureOfSchema("SYSTEM", "AFL_WRAPPER_ERASER");
                var updateData = {
                    "PROCORIG": "PAL_KMEANS_PROC_LRG"
                };
                var out = procedure(updateData, connection);

                procedure = XSProc.procedureOfSchema("SYSTEM", "AFL_WRAPPER_GENERATOR");
                updateData = {
                    "PROC": "PAL_KMEANS_PROC_LRG",
                    "AREA": "AFLPAL",
                    "AFL": "KMEANS",
                    "DATA": "\"TEST_SCHEMA2\".\"PAL_KMEANS_PDATA_TBL_LRG\""
                };
                out = procedure(updateData, connection);

            }

            utilsLib.doResponse(200, JSON.stringify(out));
        } else {
            var procedure = XSProc.procedureOfSchema(schema_name, proc_name);
            //var updateData = JSON.parse($.request.body.asString());
            var updateData = $.request.body.asString();
            //updateData = updateData.replace(/\"TIMESTAMP\":\"([0-9- :TZ]+)\"/g, "\"TIMESTAMP\":new Date(\"$1\")");


            updateData = JSON.parse(updateData, JSONDateParser);
            //$.trace.debug("Data type is:"+Object.prototype.toString.call(updateData.TIMESTAMP));
            //updateData = eval(updateData);
            //	$.trace.debug("Input body is:"+JSON.stringify(updateData));

            var out = procedure(updateData, connection);

            stmt.close();
            //	$.trace.debug("OutPut is:"+JSON.stringify(out));
            utilsLib.doResponse(200, JSON.stringify(out));
        }
    }

    function JSONDateParser(key, value) {
        var a;
        if (typeof value === 'string') {
            a = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*)?)Z$/.exec(value);
            if (a) {
                return new Date(Date.UTC(+a[1], +a[2] - 1, +a[3], +a[4], +a[5], +a[6]));
            }
        }
        return value;
    };

function getAndActivateArtifact(query) {
    //Define and initializing the Variables
    var path = "cepcore/views/";
    var sapBackPack = JSON.stringify({
        "Activate": "true",
        "CreatePkg": "true"
    });

    var cstmt = null;
    var pstmt = null;
    var rs = null;
    pstmt = connection.prepareStatement(query);
    rs = pstmt.executeQuery();
    var artifactName = '';
    var artifacttype = '';
    var cnt = 0;
    while (rs.next()) {
        cnt = cnt + 1;
        artifactName = rs.getString(1);

        $.trace.debug("View Name is:" + artifactName + cnt);
        cstmt = connection.prepareCall("CALL \"CEP_CORE\".\"GENERATE_ARTIFACT\"(?,?,?)");
        cstmt.setString(1, artifactName);
        cstmt.execute();
        artifacttype = cstmt.getNString(2);
        req = new $.web.WebRequest($.net.http.PUT, "/cepcore/views");
        req.headers.set("path", (path + artifactName + "." + artifacttype));
        req.headers.set("SapBackPack", sapBackPack);

        makeOutBoundRequest(cstmt.getClob(3));
        if (artifacttype === "xsodata")
            createService(artifactName);
    }

    cstmt.close();
    pstmt.close();

}

function handlePut() {
    /*var pstmt=null;
	var cstmt=null;
	var rs=null;
	var args=null;
	$.trace.debug("In handlePut");
	
	if(typeof oCepBackPack.Operation === 'undefined'){
		$.trace.debug("In Out Bound Call");
        //OutBound call
		var dest = $.net.http.readDestination("sap.cep.sprint8", "fileapidest");  
		var client = new $.net.http.Client();  
		var req=null;
		req= new $.web.WebRequest($.net.http.PUT,"/sap/cep/sprint8");
		prepareHeadersParameters($.request,req);
			
		req.setBody($.request.body.asString());
		client.request(req, dest);  
		var response = client.getResponse();  

		$.trace.debug("Response:"+response.body.asString());
    }*/
    var cstmt = null;
    var rs = null;
    var args = null;
    var service = '';
    var path = '/';

    $.trace.debug("In Put Method");
    if (typeof oCepBackPack.metadata !== 'undefined') {
        errorHandler.fProcessException('METHOD_NOT_SUPPORTED', ['Post method not supported for metadata']);
        return;
    }

    if (typeof oCepBackPack.path !== 'undefined' && oCepBackPack.path === '/') {
        path = '/'; // 
    } else if (typeof oCepBackPack.path !== 'undefined') {
        path = oCepBackPack.path;
    }


    if (typeof oCepBackPack.service !== 'undefined') {
        service = oCepBackPack.service; // Fetch metadata
    }

    $.trace.debug("Serice _name is:" + service);

    var stmt = connection.prepareStatement("select schema_name,procedure_name,enabled from CEP_CORE.cepmm_services where service_name='" + service + "' and method_type='PUT'");
    var rs = stmt.executeQuery();
    var proc_name = ''; // Specifying the procedure for that table
    var schema_name = '';
    while (rs.next()) {
        $.trace.debug("Schema_name is:" + rs.getString(1) + " Procedure Name is:" + rs.getString(2) + " Enabled is:" + rs.getString(3));
        proc_name = rs.getString(2); // Specifying the procedure for that table
        schema_name = rs.getString(1);
    }
    if (proc_name === '') {
        errorHandler.fProcessException('NOT_AVAILABLE', ['Service "' + service + '" not available']);
        return;
    } else {
        var procedure = XSProc.procedureOfSchema(schema_name, proc_name);
        var updateData = JSON.parse($.request.body.asString());
        //	$.trace.debug("Input body is:"+$.request.body.asString());
        var out = procedure(updateData, connection);

        stmt.close();
        //	$.trace.debug("OutPut is:"+JSON.stringify(out));
    }

}

function handleDelete() {
    var args = null;

    errorHandler.fProcessException('NOT_IMPLEMENTED', ['Delete method is not handled right now']);

}


//try{  
CepBackPack = $.request.headers.get("CepBackPack");
var oCepBackPack = {};
if (CepBackPack) {
    oCepBackPack = JSON.parse(CepBackPack);
}

switch ($.request.method) {
    case $.net.http.GET:
        handleGet();
        break;
    case $.net.http.POST:
        handlePost();
        break;
    case $.net.http.PUT:
        handlePut();
        break;
    case $.net.http.DEL:
        handleDelete();
        break;
    default:
        errorHandler.fProcessException('METHOD_NOT_SUPPORTED', [$.request.method.toString()]);
        $.trace.debug("Method Not Supported");
}
connection.commit();
connection.close();
//}
/*catch(error){
    var checkresult = {};
    utilsLib.composeCheckResultError(null,500,"Internal Server Error",connection,checkresult);
    errorHandler.fProcessException('DEFAULT', "", checkresult);
	 $.trace.debug("Internal Server Error");
    connection.commit();    
    connection.close();
}*/

function createService(artifactName) {
    $.trace.debug("Entering createService");
    var serviceEntrySql = "UPSERT CEP_CORE.CEPMM_SERVICES(SERVICE_NAME,SERVICE_TYPE,SCHEMA_NAME," +
        "PROCEDURE_NAME,METHOD_TYPE,SERVICE_URI,ENABLED,CREATED_BY) VALUES(?,?,?,?,?,?,?,?) WITH PRIMARY KEY";
    var prepStmt = connection.prepareStatement(serviceEntrySql);
    prepStmt.setString(1, artifactName.toString());
    prepStmt.setString(2, "READ");
    prepStmt.setString(3, "CEP_GEN");
    prepStmt.setString(4, artifactName.toString().substring(0, artifactName.toString().length - 5));
    prepStmt.setString(5, "GET");
    prepStmt.setString(6, "/odata/");
    prepStmt.setInt(7, 1);
    prepStmt.setString(8, "CEP");
    //prepStmt.setDate(9,new Date().getTime());
    prepStmt.execute();
}